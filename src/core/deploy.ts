/**
 * Octopurr Token Deployment
 *
 * Deploy new tokens via TokenFactory on PancakeSwap V3.
 * Supports BSC Mainnet (56) and BSC Testnet (97).
 */

import {
  type PublicClient,
  parseEventLogs,
  getAddress,
  isAddress,
  keccak256,
  toHex,
  zeroAddress,
} from 'viem';
import { TokenFactory_abi } from '../abi/TokenFactory.js';
import { getChainConfig, type SupportedChainId, POOL_CONFIG } from '../config/index.js';
import { parseError } from '../utils/errors.js';
import { marketCapToTick, getDefaultTickRange } from '../utils/market-cap.js';
import type { OctopurrWalletClient, DeployResult, FeeRecipient, TokenParams, Result } from '../utils/types.js';
import type { ExtensionConfig } from './extensions.js';

// ============ Config Builders ============

export type DeployTokenParams = {
  /** Token name and symbol */
  token: TokenParams;
  /** Starting market cap in BNB (used to calculate starting tick) */
  marketCapBNB: number;
  /** Direct wallet fee recipients — transferred immediately on claimFees */
  recipients: FeeRecipient[];
  /**
   * Identity fee recipients — social identities (held in LPLocker until wallet bound + claimed).
   * identityHash = keccak256(abi.encode(uint8(resolverType), identifierString))
   * sum(recipients[*].bps) + sum(identityRecipients[*].bps) must == 10,000
   */
  identityRecipients?: Array<{ identityHash: `0x${string}`; bps: number }>;
  /** Optional extensions (CreatorBuy, VestingVault, Airdrop) */
  extensions?: ExtensionConfig[];
  /** Custom tick range (auto-calculated if omitted) */
  tickRange?: { tickLower: number; tickUpper: number };
  /** Chain ID (default: 56 = BSC Mainnet) */
  chainId?: SupportedChainId;
  /** @deprecated Use chainId instead */
  testnet?: boolean;
  /**
   * Emit image/description/social links in TokenCreated event for on-chain recovery.
   * When true: token.image and token.metadata are encoded into the deploy TX calldata.
   * When false (default): empty strings are used, saving ~11,000 gas.
   */
  onchainMetadata?: boolean;
};

/** On-chain DeploymentConfig struct matching ITokenFactory */
type DeploymentConfigStruct = {
  tokenConfig: {
    name: string;
    symbol: string;
    tokenAdmin: `0x${string}`;
    image: string;
    metadata: string;
    context: string;
  };
  poolConfig: {
    quoteToken: `0x${string}`;
    fee: number;
    tickIfToken0IsBase: number;
    tickLower: number;
    tickUpper: number;
  };
  feeConfig: {
    recipients: readonly `0x${string}`[];
    recipientBps: readonly number[];
    identityRecipients: readonly `0x${string}`[];
    identityBps: readonly number[];
  };
  extensionConfigs: readonly {
    extension: `0x${string}`;
    bps: number;
    msgValue: bigint;
    data: `0x${string}`;
  }[];
};

/** Resolve chainId from params (backward-compatible with testnet flag) */
function resolveChainId(params: { chainId?: SupportedChainId; testnet?: boolean }): SupportedChainId {
  if (params.chainId) return params.chainId;
  if (params.testnet) return 97;
  return 56;
}

/**
 * Build the on-chain DeploymentConfig from user-friendly params.
 */
export function buildDeployConfig(
  params: DeployTokenParams,
  deployer: `0x${string}`,
): DeploymentConfigStruct {
  // Validate token name & symbol
  if (!params.token.name?.trim() || params.token.name.length > 100) {
    throw new Error('Token name is required and must be <= 100 characters');
  }
  if (!params.token.symbol?.trim() || params.token.symbol.length > 20) {
    throw new Error('Token symbol is required and must be <= 20 characters');
  }

  const identityEntries: Array<{ identityHash: `0x${string}`; bps: number }> = [
    ...(params.identityRecipients ?? []),
  ];
  const delegates = identityEntries; // unified alias for validation below
  const MAX_RECIPIENTS = POOL_CONFIG.maxRecipients;
  const combinedCount = params.recipients.length + delegates.length;
  if (combinedCount > MAX_RECIPIENTS) {
    throw new Error(
      `Total recipients (wallet + identity) must not exceed ${MAX_RECIPIENTS}, got ${combinedCount}`,
    );
  }
  const directBps = params.recipients.reduce((sum, r) => sum + r.bps, 0);
  const delegateBpsTotal = delegates.reduce((sum, r) => sum + r.bps, 0);
  const totalBps = directBps + delegateBpsTotal;
  if (totalBps !== POOL_CONFIG.bps) {
    throw new Error(
      `Total BPS (recipients + identityRecipients) must equal ${POOL_CONFIG.bps}, got ${totalBps}`,
    );
  }

  const cfg = getChainConfig(resolveChainId(params));
  const startingTick = marketCapToTick(params.marketCapBNB);
  const { tickLower, tickUpper } = params.tickRange ?? getDefaultTickRange(startingTick);

  // Validate tick parameters (prevent obscure PancakeSwap reverts)
  const tickSpacing = POOL_CONFIG.tickSpacing;
  if (tickLower >= tickUpper) {
    throw new Error(`Invalid tick range: tickLower (${tickLower}) must be < tickUpper (${tickUpper})`);
  }
  if (tickLower % tickSpacing !== 0) {
    throw new Error(`tickLower (${tickLower}) must be aligned to tickSpacing (${tickSpacing})`);
  }
  if (tickUpper % tickSpacing !== 0) {
    throw new Error(`tickUpper (${tickUpper}) must be aligned to tickSpacing (${tickSpacing})`);
  }

  // On-chain metadata: when enabled, token.image and token.metadata are included in
  // the deploy TX calldata and emitted in TokenCreated event for recovery purposes.
  // When disabled (default), empty strings save ~11,000 gas.
  //
  // Relaxed validation: truncate oversized strings with console warning.
  // SDK does NOT reject — user decides what to put on-chain, but we prevent accidental bloat.
  const emitMeta = params.onchainMetadata === true;
  const MAX_IMAGE = 256;
  const MAX_METADATA = 2048;

  let image = '';
  let metadata = '';
  if (emitMeta) {
    image = params.token.image ?? '';
    metadata = params.token.metadata ?? '';
    if (image.length > MAX_IMAGE) {
      console.warn(`[SDK] token.image truncated: ${image.length} → ${MAX_IMAGE} chars`);
      image = image.slice(0, MAX_IMAGE);
    }
    if (metadata.length > MAX_METADATA) {
      console.warn(`[SDK] token.metadata truncated: ${metadata.length} → ${MAX_METADATA} chars`);
      metadata = metadata.slice(0, MAX_METADATA);
    }
  }

  return {
    tokenConfig: {
      name: params.token.name,
      symbol: params.token.symbol,
      tokenAdmin: params.token.tokenAdmin ?? zeroAddress,
      image,
      metadata,
      context: params.token.context ?? '',
    },
    poolConfig: {
      quoteToken: cfg.wbnb,
      fee: POOL_CONFIG.feeTier,
      tickIfToken0IsBase: startingTick,
      tickLower,
      tickUpper,
    },
    feeConfig: {
      recipients: params.recipients.map((r) => getAddress(r.address) as `0x${string}`),
      recipientBps: params.recipients.map((r) => r.bps),
      identityRecipients: delegates.map((r) => r.identityHash),
      identityBps: delegates.map((r) => r.bps),
    },
    extensionConfigs: params.extensions ?? [],
  };
}

// ============ Salt Generation ============

/**
 * Generate a random salt for CREATE2 deployment.
 * Combined with msg.sender on-chain for unpredictable token addresses.
 */
function generateSalt(): `0x${string}` {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return keccak256(toHex(randomBytes));
}

// ============ Deployment Functions ============

/**
 * Simulate a token deployment (dry run, no gas spent).
 */
export async function simulateDeploy(
  params: DeployTokenParams,
  publicClient: PublicClient,
  account: `0x${string}`,
): Promise<Result<{ success: true }>> {
  try {
    const cfg = getChainConfig(resolveChainId(params));
    const config = buildDeployConfig(params, account);
    const totalMsgValue = (params.extensions ?? []).reduce((sum, e) => sum + e.msgValue, 0n);

    const salt = generateSalt();
    await publicClient.simulateContract({
      address: cfg.octopurr.tokenFactory,
      abi: TokenFactory_abi,
      functionName: 'deployToken',
      args: [config, salt],
      value: totalMsgValue,
      account,
    });

    return { success: true };
  } catch (e) {
    return { error: parseError(e) };
  }
}

/**
 * Deploy a new token.
 * Simulates first, then sends the transaction and waits for confirmation.
 */
export async function deployToken(
  params: DeployTokenParams,
  publicClient: PublicClient,
  walletClient: OctopurrWalletClient,
): Promise<Result<DeployResult>> {
  try {
    const cfg = getChainConfig(resolveChainId(params));
    const account = walletClient.account.address;
    const config = buildDeployConfig(params, account);
    const totalMsgValue = (params.extensions ?? []).reduce((sum, e) => sum + e.msgValue, 0n);
    const factoryAddress = cfg.octopurr.tokenFactory;
    const salt = generateSalt();

    await publicClient.simulateContract({
      address: factoryAddress,
      abi: TokenFactory_abi,
      functionName: 'deployToken',
      args: [config, salt],
      value: totalMsgValue,
      account,
    });

    const gasEstimate = await publicClient.estimateContractGas({
      address: factoryAddress,
      abi: TokenFactory_abi,
      functionName: 'deployToken',
      args: [config, salt],
      value: totalMsgValue,
      account,
    });

    const txHash = await walletClient.writeContract({
      address: factoryAddress,
      abi: TokenFactory_abi,
      functionName: 'deployToken',
      args: [config, salt],
      value: totalMsgValue,
      gas: (gasEstimate * 120n) / 100n,
      account: walletClient.account,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status === 'reverted') {
      return { error: parseError(new Error(`Transaction reverted: ${txHash}`)) };
    }

    const logs = parseEventLogs({
      abi: TokenFactory_abi,
      eventName: 'TokenCreated',
      logs: receipt.logs,
    });

    if (logs.length === 0) {
      return { error: parseError(new Error('TokenCreated event not found in receipt')) };
    }

    const event = logs[0].args;

    return {
      txHash,
      tokenAddress: event.tokenAddress,
      poolAddress: event.pool,
      nftTokenId: event.nftTokenId,
    };
  } catch (e) {
    return { error: parseError(e) };
  }
}

/**
 * Register a deployed token with the Octopurr API for listing.
 */
export async function registerToken(
  apiUrl: string,
  data: {
    address: string;
    name: string;
    symbol: string;
    creatorWallet: string;
    deployTx: string;
    tokenAdmin?: string;
    preset?: 'standard' | 'social' | 'pro';
    marketCapBnb?: number;
    description?: string;
    metadata?: {
      website?: string;
      github?: string;
      twitter?: string;
      moltbook?: string;
      telegram?: string;
      discord?: string;
      binancesquare?: string;
    };
    feeRecipients?: Array<{ address: string; bps: number }>;
    /**
     * Identity fee recipients.
     * platform + identifier are display metadata (stored in DB for UI).
     * They do not affect on-chain fee distribution.
     */
    identityRecipients?: Array<{
      identityHash: string;
      bps: number;
      platform?: string;
      identifier?: string;
      accountId?: string | null;
      username?: string | null;
    }>;
    chainId?: number;
  },
): Promise<Result<{ status: string; address: string }>> {
  // Validate required fields before sending
  if (!data.address || !isAddress(data.address)) {
    return { error: parseError(new Error('Invalid or missing token address')) };
  }
  if (!data.name?.trim()) {
    return { error: parseError(new Error('Token name is required')) };
  }
  if (!data.symbol?.trim()) {
    return { error: parseError(new Error('Token symbol is required')) };
  }
  if (!data.creatorWallet || !isAddress(data.creatorWallet)) {
    return { error: parseError(new Error('Invalid or missing creatorWallet address')) };
  }
  if (!data.deployTx?.startsWith('0x')) {
    return { error: parseError(new Error('Invalid or missing deployTx hash')) };
  }

  const body = JSON.stringify({
    ...data,
    deployMethod: 'sdk',
    preset: data.preset ?? 'standard',
  });

  // Retry once on transient failure (network timeout, 5xx).
  // Token is already on-chain at this point — registration is metadata-only.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${apiUrl}/api/v1/tokens/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        // Don't retry 4xx — client error won't change on retry
        if (res.status < 500) {
          return { error: parseError(new Error((err as any).error || `HTTP ${res.status}`)) };
        }
        // 5xx: retry once
        if (attempt === 0) continue;
        return { error: parseError(new Error((err as any).error || `HTTP ${res.status}`)) };
      }

      return await res.json() as { status: string; address: string };
    } catch (e) {
      // Network/timeout error: retry once
      if (attempt === 0) continue;
      return { error: parseError(e) };
    }
  }

  return { error: parseError(new Error('registerToken failed after retry')) };
}

/**
 * Get deploy request status by queue id.
 */
export async function getDeployRequestStatus(
  apiUrl: string,
  id: number,
  apiKey?: string,
): Promise<Result<{ data: Record<string, unknown> }>> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-API-Key'] = apiKey;

    const res = await fetch(`${apiUrl}/api/v1/deploy/${id}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return { error: parseError(new Error((err as any).error || `HTTP ${res.status}`)) };
    }

    return await res.json() as { data: Record<string, unknown> };
  } catch (e) {
    return { error: parseError(e) };
  }
}

/**
 * Get deploy queue metrics.
 */
export async function getDeployQueueStatus(
  apiUrl: string,
): Promise<Result<{ data: { waiting: number; active: number; completed: number; failed: number } }>> {
  try {
    const res = await fetch(`${apiUrl}/api/v1/deploy/queue`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return { error: parseError(new Error((err as any).error || `HTTP ${res.status}`)) };
    }

    return await res.json() as { data: { waiting: number; active: number; completed: number; failed: number } };
  } catch (e) {
    return { error: parseError(e) };
  }
}

/**
 * Get deployment info for a previously deployed token.
 */
export async function getDeploymentInfo(
  token: `0x${string}`,
  publicClient: PublicClient,
  chainId?: SupportedChainId,
): Promise<{
  token: `0x${string}`;
  pool: `0x${string}`;
  nftTokenId: bigint;
} | null> {
  try {
    const cfg = getChainConfig(chainId ?? 56);
    const result = await publicClient.readContract({
      address: cfg.octopurr.tokenFactory,
      abi: TokenFactory_abi,
      functionName: 'deploymentInfoForToken',
      args: [token],
    });

    if (result[0] === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    return {
      token: result[0],
      pool: result[1],
      nftTokenId: result[2],
    };
  } catch {
    return null;
  }
}
