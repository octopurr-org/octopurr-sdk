/**
 * Extension encoding helpers for Octopurr deployment.
 *
 * Each function encodes the `data` field for ExtensionConfig.
 * Extensions receive tokens (bps > 0) or BNB (msgValue > 0) during deploy.
 */

import { encodeAbiParameters } from 'viem';
import { getChainConfig, type SupportedChainId } from '../config/index.js';

// Product policy: CreatorBuy may allow up to 100% slippage at client layer.
// CreatorBuy contract still requires amountOutMinimum > 0.
export const CREATOR_BUY_MAX_SLIPPAGE_MIN_OUT = 1n;

/** CreatorBuy extension data */
export type CreatorBuyParams = {
  /** Recipient of purchased tokens */
  recipient: `0x${string}`;
  /** Minimum tokens to receive (must be > 0). Use CREATOR_BUY_MAX_SLIPPAGE_MIN_OUT for 100% max-slippage policy. */
  amountOutMinimum: bigint;
};

/**
 * VestingVault — direct mode.
 * Admin wallet receives vested tokens and can transfer the admin role.
 */
export type VestingVaultDirectParams = {
  /** Lockup duration in seconds (0 = instant unlock after deploy) */
  lockupDuration: number;
  /** Vesting duration in seconds after lockup; 0 = all tokens unlock at lockup end */
  vestingDuration: number;
  /** Wallet that receives vested tokens and can rotate the role */
  admin: `0x${string}`;
  agentId?: never;
};

/**
 * VestingVault — agent mode.
 * Claims are authorized via IdentityResolver.resolveWallet(). Caller must be
 * agentWallet or ownerOf(agentId). Tokens go to the resolved agentWallet.
 */
export type VestingVaultAgentParams = {
  /** Lockup duration in seconds (0 = instant unlock after deploy) */
  lockupDuration: number;
  /** Vesting duration in seconds after lockup; 0 = all tokens unlock at lockup end */
  vestingDuration: number;
  /** ERC-8004 agent ID. Token claim is gated by the agent's identity via IdentityResolver. */
  agentId: bigint;
  admin?: never;
};

/**
 * VestingVault extension params — direct mode (admin wallet) or agent mode (ERC-8004 agentId).
 * The two modes are mutually exclusive; TypeScript enforces the XOR constraint at compile time.
 */
export type VestingVaultParams = VestingVaultDirectParams | VestingVaultAgentParams;

/** AirdropDistributor extension data */
export type AirdropDistributorParams = {
  /** Merkle root of the airdrop tree */
  merkleRoot: `0x${string}`;
  /** Admin address (can update merkle root) */
  admin: `0x${string}`;
};

/**
 * Encode CreatorBuy extension data.
 * CreatorBuy must have bps=0 (no token allocation) and msgValue > 0 (BNB to spend).
 */
export function encodeCreatorBuyData(params: CreatorBuyParams): `0x${string}` {
  if (params.amountOutMinimum <= 0n) {
    throw new Error('amountOutMinimum must be > 0 (slippage protection required)');
  }
  return encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    [params.recipient, params.amountOutMinimum],
  );
}

/**
 * Encode VestingVault extension data.
 *
 * Matches contract struct VaultExtensionData:
 *   (uint256 lockupDuration, uint256 vestingDuration, address admin, bool isAgentMode, uint256 agentId)
 *
 * Direct mode: admin is non-zero, isAgentMode=false, agentId=0.
 * Agent  mode: admin is address(0), isAgentMode=true, agentId=<ERC-8004 agent ID>.
 */
export function encodeVestingVaultData(params: VestingVaultParams): `0x${string}` {
  const isAgentMode = 'agentId' in params && params.agentId !== undefined;
  return encodeAbiParameters(
    [
      { type: 'uint256' }, // lockupDuration
      { type: 'uint256' }, // vestingDuration
      { type: 'address' }, // admin (address(0) in agent mode)
      { type: 'bool' },    // isAgentMode
      { type: 'uint256' }, // agentId (0 in direct mode)
    ],
    [
      BigInt(params.lockupDuration),
      BigInt(params.vestingDuration),
      isAgentMode ? '0x0000000000000000000000000000000000000000' : params.admin!,
      isAgentMode,
      isAgentMode ? params.agentId! : 0n,
    ],
  );
}

/**
 * Encode AirdropDistributor extension data.
 */
export function encodeAirdropData(params: AirdropDistributorParams): `0x${string}` {
  // Contract source of truth: IAirdropDistributor.AirdropExtensionData
  // struct AirdropExtensionData { bytes32 merkleRoot; address admin; }
  return encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'address' }],
    [params.merkleRoot, params.admin],
  );
}

/** Build a full ExtensionConfig struct for the deploy call */
export type ExtensionConfig = {
  extension: `0x${string}`;
  bps: number;
  msgValue: bigint;
  data: `0x${string}`;
};

/**
 * Build CreatorBuy ExtensionConfig.
 * @param bnbAmount - Amount of BNB to spend buying tokens
 * @param params - CreatorBuy parameters
 */
export function buildCreatorBuyExtension(
  bnbAmount: bigint,
  params: CreatorBuyParams,
  chainId?: SupportedChainId,
): ExtensionConfig {
  const cfg = getChainConfig(chainId ?? 56);
  return {
    extension: cfg.octopurr.creatorBuy,
    bps: 0, // CreatorBuy must have 0 bps
    msgValue: bnbAmount,
    data: encodeCreatorBuyData(params),
  };
}

/**
 * Build VestingVault ExtensionConfig.
 * @param bps - Share of total supply in BPS (e.g., 1000 = 10%)
 * @param params - Vesting parameters
 */
export function buildVestingVaultExtension(
  bps: number,
  params: VestingVaultParams,
  chainId?: SupportedChainId,
): ExtensionConfig {
  const cfg = getChainConfig(chainId ?? 56);
  return {
    extension: cfg.octopurr.vestingVault,
    bps,
    msgValue: 0n,
    data: encodeVestingVaultData(params),
  };
}

/**
 * Build AirdropDistributor ExtensionConfig.
 * @param bps - Share of total supply in BPS (e.g., 500 = 5%)
 * @param params - Airdrop parameters
 */
export function buildAirdropExtension(
  bps: number,
  params: AirdropDistributorParams,
  chainId?: SupportedChainId,
): ExtensionConfig {
  const cfg = getChainConfig(chainId ?? 56);
  return {
    extension: cfg.octopurr.airdropDistributor,
    bps,
    msgValue: 0n,
    data: encodeAirdropData(params),
  };
}
