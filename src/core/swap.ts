/**
 * Octopurr Swap — Buy/Sell tokens via PancakeSwap Infinity Universal Router
 *
 * Uses Universal Router's command-based execution for atomic swaps with 1% interface fee.
 * Supports BSC Mainnet (56) and BSC Testnet (97).
 *
 * Buy flow (1 TX):
 *   WRAP_ETH → PAY_PORTION(1% to protocol) → V3_SWAP_EXACT_IN(99% WBNB → token, router) → SWEEP(token, router→user)
 *
 * Sell flow (1 TX):
 *   PERMIT2_PERMIT → V3_SWAP_EXACT_IN(token → WBNB to router) → PAY_PORTION(1% to protocol) → SWEEP(WBNB → user)
 *
 * Requires Permit2 approval for sell (one-time token.approve(Permit2, MAX)).
 */

import { type PublicClient, encodePacked, encodeAbiParameters, concat, numberToHex } from 'viem';
import { ERC20_abi, QuoterV2_abi } from '../abi/PancakeV3.js';
import { UniversalRouter_abi, Permit2_abi } from '../abi/UniversalRouter.js';
import {
  getChainConfig, type SupportedChainId,
  POOL_CONFIG, UR_COMMANDS, UR_ADDRESS, INTERFACE_FEE_BPS,
} from '../config/index.js';
import { parseError } from '../utils/errors.js';
import { OctopurrError, type OctopurrWalletClient, type Result, type SwapResult } from '../utils/types.js';

// ============ Types ============

export type SwapDirection = 'buy' | 'sell';

export type SwapParams = {
  /** Token address */
  token: `0x${string}`;
  /** Amount in (BNB for buy, tokens for sell) — in wei */
  amountIn: bigint;
  /** Slippage tolerance in BPS (default: 500 = 5%). Range: 0-10000 (0%-100%) */
  slippageBps?: number;
  /** Transaction deadline in seconds from now (default: 20 minutes) */
  deadlineSeconds?: number;
  /** Chain ID (default: 56 = BSC Mainnet) */
  chainId?: SupportedChainId;
};

// ============ Command Encoding Helpers ============

function commandByte(cmd: number): `0x${string}` {
  return numberToHex(cmd, { size: 1 });
}

function buildCommands(cmds: number[]): `0x${string}` {
  return concat(cmds.map(c => commandByte(c)));
}

function encodeWrapEth(recipient: `0x${string}`, amount: bigint): `0x${string}` {
  return encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    [recipient, amount],
  );
}

function encodePayPortion(token: `0x${string}`, recipient: `0x${string}`, bips: bigint): `0x${string}` {
  return encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }],
    [token, recipient, bips],
  );
}

function encodeV3SwapExactIn(
  recipient: `0x${string}`,
  amountIn: bigint,
  amountOutMinimum: bigint,
  path: `0x${string}`,
  payerIsUser: boolean,
): `0x${string}` {
  return encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes' }, { type: 'bool' }],
    [recipient, amountIn, amountOutMinimum, path, payerIsUser],
  );
}

function encodeSweep(token: `0x${string}`, recipient: `0x${string}`, amountMin: bigint): `0x${string}` {
  return encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }],
    [token, recipient, amountMin],
  );
}

function encodePermit2Permit(
  permitSingle: {
    details: { token: `0x${string}`; amount: bigint; expiration: bigint; nonce: bigint };
    spender: `0x${string}`;
    sigDeadline: bigint;
  },
  signature: `0x${string}`,
): `0x${string}` {
  return encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          {
            type: 'tuple', name: 'details',
            components: [
              { type: 'address', name: 'token' },
              { type: 'uint160', name: 'amount' },
              { type: 'uint48', name: 'expiration' },
              { type: 'uint48', name: 'nonce' },
            ],
          },
          { type: 'address', name: 'spender' },
          { type: 'uint256', name: 'sigDeadline' },
        ],
      },
      { type: 'bytes' },
    ],
    [
      {
        details: {
          token: permitSingle.details.token,
          amount: permitSingle.details.amount,
          expiration: Number(permitSingle.details.expiration),
          nonce: Number(permitSingle.details.nonce),
        },
        spender: permitSingle.spender,
        sigDeadline: permitSingle.sigDeadline,
      },
      signature,
    ],
  );
}

function buildV3Path(tokenIn: `0x${string}`, fee: number, tokenOut: `0x${string}`): `0x${string}` {
  return encodePacked(['address', 'uint24', 'address'], [tokenIn, fee, tokenOut]);
}

// ============ Core Functions ============

/**
 * Buy tokens with BNB via Universal Router.
 *
 * Flow (1 TX):
 * 1. WRAP_ETH: wrap all BNB to WBNB in router
 * 2. PAY_PORTION: send 1% WBNB to ProtocolFeeCollector
 * 3. V3_SWAP_EXACT_IN: swap remaining 99% WBNB → token
 * 4. SWEEP: send tokens to user
 */
export async function buyToken(
  params: SwapParams,
  publicClient: PublicClient,
  walletClient: OctopurrWalletClient,
): Promise<Result<SwapResult>> {
  try {
    const cfg = getChainConfig(params.chainId ?? 56);
    const account = walletClient.account.address;
    const wbnb = cfg.wbnb;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSeconds ?? 1200));
    const slippageBps = params.slippageBps ?? 500;
    if (slippageBps < 0 || slippageBps > 10_000) {
      return { error: OctopurrError.revert('slippageBps must be between 0 and 10000 (0%-100%)') };
    }
    const protocol = cfg.octopurr.protocolFeeCollector;

    // Calculate fee and swap amounts for quote
    const feeAmount = (params.amountIn * INTERFACE_FEE_BPS) / 10_000n;
    const swapAmount = params.amountIn - feeAmount;

    // Get quote via QuoterV2 — fail-closed: reject swap if quote fails
    const buyPath = buildV3Path(wbnb, POOL_CONFIG.feeTier, params.token);
    let amountOutMinimum: bigint;

    try {
      const { result } = await publicClient.simulateContract({
        address: cfg.pancake.quoterV2,
        abi: QuoterV2_abi,
        functionName: 'quoteExactInputSingle',
        args: [{
          tokenIn: wbnb,
          tokenOut: params.token,
          amountIn: swapAmount,
          fee: POOL_CONFIG.feeTier,
          sqrtPriceLimitX96: 0n,
        }],
      });
      const quotedOut = result[0];
      amountOutMinimum = quotedOut - (quotedOut * BigInt(slippageBps)) / 10_000n;
    } catch (quoteErr) {
      return { error: OctopurrError.revert('Quote failed — cannot swap without slippage protection', quoteErr as Error) };
    }

    const commands = buildCommands([
      UR_COMMANDS.WRAP_ETH,
      UR_COMMANDS.PAY_PORTION,
      UR_COMMANDS.V3_SWAP_EXACT_IN,
      UR_COMMANDS.SWEEP,
    ]);

    const inputs: `0x${string}`[] = [
      encodeWrapEth(UR_ADDRESS.ADDRESS_THIS, params.amountIn),
      encodePayPortion(wbnb, protocol, INTERFACE_FEE_BPS),
      encodeV3SwapExactIn(UR_ADDRESS.ADDRESS_THIS, swapAmount, amountOutMinimum, buyPath, false),
      encodeSweep(params.token, UR_ADDRESS.MSG_SENDER, amountOutMinimum),
    ];

    const { request } = await publicClient.simulateContract({
      address: cfg.pancake.universalRouter,
      abi: UniversalRouter_abi,
      functionName: 'execute',
      args: [commands, inputs, deadline],
      value: params.amountIn,
      account,
    });

    const txHash = await walletClient.writeContract({ ...request, account: walletClient.account });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status === 'reverted') {
      return { error: parseError(new Error(`Buy transaction reverted: ${txHash}`)) };
    }

    return {
      txHash,
      amountIn: params.amountIn,
      amountOutMinimum,
    };
  } catch (e) {
    return { error: parseError(e) };
  }
}

/**
 * Sell tokens for WBNB via Universal Router.
 *
 * Flow (1 TX):
 * 1. PERMIT2_PERMIT: authorize router to pull tokens via Permit2
 * 2. V3_SWAP_EXACT_IN: swap token → WBNB, router holds WBNB
 * 3. PAY_PORTION: send 1% WBNB to ProtocolFeeCollector
 * 4. SWEEP: send remaining WBNB to user
 *
 * Prerequisite: token.approve(Permit2, MAX) — one-time per token
 */
export async function sellToken(
  params: SwapParams & {
    /** Permit2 signature — if omitted, the SDK will sign automatically using walletClient */
    permit2Signature?: `0x${string}`;
    /** Permit2 nonce — if omitted, fetched automatically */
    permit2Nonce?: bigint;
    /** Permit2 deadline — must match the deadline used when signing. If omitted, computed from deadlineSeconds */
    permit2Deadline?: bigint;
  },
  publicClient: PublicClient,
  walletClient: OctopurrWalletClient,
): Promise<Result<SwapResult>> {
  try {
    const cfg = getChainConfig(params.chainId ?? 56);
    const chainId = params.chainId ?? 56;
    const account = walletClient.account.address;
    const wbnb = cfg.wbnb;
    const deadline = params.permit2Deadline ?? BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSeconds ?? 1200));

    // Auto-approve Permit2 if needed (one-time per token)
    await ensurePermit2Approval(params.token, publicClient, walletClient, chainId);

    // Auto-sign Permit2 if signature not provided
    let permit2Nonce = params.permit2Nonce;
    let permit2Signature = params.permit2Signature;
    if (!permit2Signature) {
      permit2Nonce = await getPermit2Nonce(account, params.token, publicClient, chainId);
      const typedData = buildPermit2TypedData(params.token, params.amountIn, permit2Nonce, deadline, chainId);
      permit2Signature = await walletClient.signTypedData(typedData);
    }
    if (permit2Nonce == null) {
      permit2Nonce = await getPermit2Nonce(account, params.token, publicClient, chainId);
    }
    const slippageBps = params.slippageBps ?? 500;
    if (slippageBps < 0 || slippageBps > 10_000) {
      return { error: OctopurrError.revert('slippageBps must be between 0 and 10000 (0%-100%)') };
    }
    const protocol = cfg.octopurr.protocolFeeCollector;

    // Permit2 amount field is uint160 — reject if amountIn exceeds it
    const MAX_UINT160 = 2n ** 160n - 1n;
    if (params.amountIn > MAX_UINT160) {
      return { error: OctopurrError.revert(`amountIn exceeds uint160 max (Permit2 limit)`) };
    }

    const sellPath = buildV3Path(params.token, POOL_CONFIG.feeTier, wbnb);
    let amountOutMinimum: bigint;
    let preFeeMinOut: bigint;

    try {
      const { result } = await publicClient.simulateContract({
        address: cfg.pancake.quoterV2,
        abi: QuoterV2_abi,
        functionName: 'quoteExactInputSingle',
        args: [{
          tokenIn: params.token,
          tokenOut: wbnb,
          amountIn: params.amountIn,
          fee: POOL_CONFIG.feeTier,
          sqrtPriceLimitX96: 0n,
        }],
      });
      const quotedOut = result[0];
      // Pre-fee minimum: slippage applied to raw swap output (defense-in-depth for V3_SWAP)
      preFeeMinOut = quotedOut - (quotedOut * BigInt(slippageBps)) / 10_000n;
      // Post-fee minimum: what user actually receives after interface fee
      const afterFee = quotedOut - (quotedOut * INTERFACE_FEE_BPS) / 10_000n;
      amountOutMinimum = afterFee - (afterFee * BigInt(slippageBps)) / 10_000n;
    } catch (quoteErr) {
      return { error: OctopurrError.revert('Quote failed — cannot swap without slippage protection', quoteErr as Error) };
    }

    const permitSingle = {
      details: {
        token: params.token,
        amount: params.amountIn,
        expiration: deadline,
        nonce: permit2Nonce,
      },
      spender: cfg.pancake.universalRouter,
      sigDeadline: deadline,
    };

    const commands = buildCommands([
      UR_COMMANDS.PERMIT2_PERMIT,
      UR_COMMANDS.V3_SWAP_EXACT_IN,
      UR_COMMANDS.PAY_PORTION,
      UR_COMMANDS.SWEEP,
    ]);

    const inputs: `0x${string}`[] = [
      encodePermit2Permit(permitSingle, permit2Signature!),
      encodeV3SwapExactIn(UR_ADDRESS.ADDRESS_THIS, params.amountIn, preFeeMinOut, sellPath, true),
      encodePayPortion(wbnb, protocol, INTERFACE_FEE_BPS),
      encodeSweep(wbnb, UR_ADDRESS.MSG_SENDER, amountOutMinimum),
    ];

    const { request } = await publicClient.simulateContract({
      address: cfg.pancake.universalRouter,
      abi: UniversalRouter_abi,
      functionName: 'execute',
      args: [commands, inputs, deadline],
      value: 0n,
      account,
    });

    const txHash = await walletClient.writeContract({ ...request, account: walletClient.account });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status === 'reverted') {
      return { error: parseError(new Error(`Sell transaction reverted: ${txHash}`)) };
    }

    return {
      txHash,
      amountIn: params.amountIn,
      amountOutMinimum,
    };
  } catch (e) {
    return { error: parseError(e) };
  }
}

// ============ Permit2 Helpers ============

/**
 * Ensure token is approved to Permit2 (one-time per token).
 */
export async function ensurePermit2Approval(
  token: `0x${string}`,
  publicClient: PublicClient,
  walletClient: OctopurrWalletClient,
  chainId?: SupportedChainId,
): Promise<boolean> {
  const cfg = getChainConfig(chainId ?? 56);
  const owner = walletClient.account.address;
  const maxUint256 = 2n ** 256n - 1n;

  const allowance = await publicClient.readContract({
    address: token,
    abi: ERC20_abi,
    functionName: 'allowance',
    args: [owner, cfg.pancake.permit2],
  });

  if (allowance > 0n) return true;

  const { request } = await publicClient.simulateContract({
    address: token,
    abi: ERC20_abi,
    functionName: 'approve',
    args: [cfg.pancake.permit2, maxUint256],
    account: owner,
  });
  const txHash = await walletClient.writeContract({ ...request, account: walletClient.account });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return true;
}

/**
 * Get current Permit2 nonce for a token/spender pair.
 */
export async function getPermit2Nonce(
  owner: `0x${string}`,
  token: `0x${string}`,
  publicClient: PublicClient,
  chainId?: SupportedChainId,
): Promise<bigint> {
  const cfg = getChainConfig(chainId ?? 56);
  const result = await publicClient.readContract({
    address: cfg.pancake.permit2,
    abi: Permit2_abi,
    functionName: 'allowance',
    args: [owner, token, cfg.pancake.universalRouter],
  });
  return BigInt(result[2]);
}

/**
 * Build the EIP-712 typed data for Permit2 PermitSingle signing.
 */
export function buildPermit2TypedData(
  token: `0x${string}`,
  amount: bigint,
  nonce: bigint,
  deadline: bigint,
  chainId?: SupportedChainId,
) {
  const cfg = getChainConfig(chainId ?? 56);
  const cappedAmount = amount > 2n ** 160n - 1n ? 2n ** 160n - 1n : amount;

  return {
    domain: {
      name: 'Permit2' as const,
      chainId: cfg.chainId,
      verifyingContract: cfg.pancake.permit2,
    },
    types: {
      PermitSingle: [
        { name: 'details', type: 'PermitDetails' },
        { name: 'spender', type: 'address' },
        { name: 'sigDeadline', type: 'uint256' },
      ],
      PermitDetails: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint160' },
        { name: 'expiration', type: 'uint48' },
        { name: 'nonce', type: 'uint48' },
      ],
    },
    primaryType: 'PermitSingle' as const,
    message: {
      details: {
        token,
        amount: cappedAmount,
        expiration: deadline,
        nonce,
      },
      spender: cfg.pancake.universalRouter,
      sigDeadline: deadline,
    },
  };
}

export { ensurePermit2Approval as ensureApproval };
