/**
 * Octopurr Fee Management
 *
 * Claim LP trading fees, view locked positions, claim identity fees.
 * Fee distribution: WBNB 20% protocol + 80% recipients (direct + identity), base token 100% protocol.
 *
 * Key model:
 * - Direct recipients receive WBNB immediately on claimFees()
 * - Identity recipients accumulate pendingBalance per (identityHash, tokenId)
 * - claimByIdentity(identityHash, tokenId, resolveData) → send to IdentityResolver-resolved wallet
 *
 * Authorization for claimByIdentity (enforced on-chain by IdentityResolver):
 *   Social  (type=0): caller must be the bound wallet.
 *   ERC-8004 (type=1): caller must be agentWallet OR ownerOf(agentId).
 *                      Funds always sent to agentWallet (not necessarily the caller).
 *
 * Convenience wrappers:
 *   claimSocialFees(platform, recipientId, tokenId, ...) — social identity claim
 *   claimAgentFees(agentId, tokenId, ...)               — ERC-8004 agent claim
 *   getAgentFeeState(agentId, tokenId, ...)              — pre-claim state check
 *
 * Supports BSC Mainnet (56) and BSC Testnet (97).
 */

import { type PublicClient, type Address } from 'viem';
import { LPLocker_abi } from '../abi/LPLocker.js';
import { getChainConfig, type SupportedChainId } from '../config/index.js';
import {
  computeSocialIdentityHash,
  computeErc8004IdentityHash,
  encodeSocialResolveData,
  encodeErc8004ResolveData,
} from './identity-resolver.js';
import { getAgentInfo } from './agent-deployer.js';
import { parseError } from '../utils/errors.js';
import type { OctopurrWalletClient, ClaimResult, Result } from '../utils/types.js';

// ============ Types ============

/** Locked LP position with fee recipients */
export type LockedPosition = {
  tokenId: bigint;
  baseToken: `0x${string}`;   // launch token address
  quoteToken: `0x${string}`;  // paired token (e.g. WBNB)
  recipients: readonly `0x${string}`[];      // direct wallet recipients
  recipientBps: readonly number[];
  identityRecipients: readonly `0x${string}`[]; // keccak256(abi.encode(uint8(resolverType), identifierString))
  identityBps: readonly number[];
  lockedAt: bigint;
};

// ============ Helpers ============

function getLPLockerAddress(chainId: SupportedChainId): Address {
  return getChainConfig(chainId).octopurr.lpLocker;
}

// ============ Read Functions ============

/**
 * Get locked position info for an LP NFT.
 *
 * @param tokenId - LP NFT token ID
 * @returns Position info or null if not locked
 */
export async function getPosition(
  tokenId: bigint,
  publicClient: PublicClient,
  chainId: SupportedChainId = 56,
): Promise<LockedPosition | null> {
  try {
    const result = await publicClient.readContract({
      address: getLPLockerAddress(chainId),
      abi: LPLocker_abi,
      functionName: 'getPosition',
      args: [tokenId],
    });

    if ((result as any).lockedAt === 0n) return null;

    return {
      tokenId: (result as any).tokenId,
      baseToken: (result as any).baseToken,
      quoteToken: (result as any).quoteToken,
      recipients: (result as any).recipients,
      recipientBps: (result as any).recipientBps,
      identityRecipients: (result as any).identityRecipients,
      identityBps: (result as any).identityBps,
      lockedAt: (result as any).lockedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Get pending WBNB balance for an identity recipient on a specific LP position.
 * Balance is per (identityHash, tokenId) — each LP position tracked independently.
 *
 * @param identityHash - keccak256(abi.encode(uint8(resolverType), identifierString))
 * @param tokenId - LP NFT token ID
 */
export async function getPendingBalance(
  identityHash: `0x${string}`,
  tokenId: bigint,
  publicClient: PublicClient,
  chainId: SupportedChainId = 56,
): Promise<bigint> {
  return publicClient.readContract({
    address: getLPLockerAddress(chainId),
    abi: LPLocker_abi,
    functionName: 'pendingBalance',
    args: [identityHash, tokenId],
  }) as Promise<bigint>;
}

/**
 * Check if an identity balance has expired (3 years = 1095 days).
 */
export async function isExpired(
  identityHash: `0x${string}`,
  tokenId: bigint,
  publicClient: PublicClient,
  chainId: SupportedChainId = 56,
): Promise<boolean> {
  return publicClient.readContract({
    address: getLPLockerAddress(chainId),
    abi: LPLocker_abi,
    functionName: 'isExpired',
    args: [identityHash, tokenId],
  }) as Promise<boolean>;
}

// ============ Write Functions ============

/**
 * Claim fees for a single locked LP position. Permissionless.
 * Direct recipients receive WBNB immediately.
 * Identity recipients accumulate in pendingBalance.
 */
export async function claimFees(
  tokenId: bigint,
  publicClient: PublicClient,
  walletClient: OctopurrWalletClient,
  chainId: SupportedChainId = 56,
): Promise<Result<ClaimResult>> {
  try {
    const { request } = await publicClient.simulateContract({
      address: getLPLockerAddress(chainId),
      abi: LPLocker_abi,
      functionName: 'claimFees',
      args: [tokenId],
      account: walletClient.account.address,
    });
    const txHash = await walletClient.writeContract({ ...request, account: walletClient.account });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  } catch (e) {
    return { error: parseError(e) };
  }
}

/**
 * Claim fees for multiple locked LP positions in one transaction. Permissionless.
 */
export async function claimFeesMulti(
  tokenIds: bigint[],
  publicClient: PublicClient,
  walletClient: OctopurrWalletClient,
  chainId: SupportedChainId = 56,
): Promise<Result<ClaimResult>> {
  try {
    const { request } = await publicClient.simulateContract({
      address: getLPLockerAddress(chainId),
      abi: LPLocker_abi,
      functionName: 'claimFeesMulti',
      args: [tokenIds],
      account: walletClient.account.address,
    });
    const txHash = await walletClient.writeContract({ ...request, account: walletClient.account });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  } catch (e) {
    return { error: parseError(e) };
  }
}

/**
/**
 * Claim accumulated identity fees for a specific LP position.
 *
 * Authorization is enforced on-chain by IdentityResolver.resolveWallet():
 *   - Social  (type=0): walletClient.account must be the bound wallet.
 *   - ERC-8004 (type=1):
 *     · If agentWallet not set (address(0)): reverts AgentWalletNotSet.
 *       Call setAgentWallet() on the ERC-8004 IdentityRegistry first.
 *     · Otherwise: walletClient.account must be agentWallet OR ownerOf(agentId).
 *       Reverts SenderNotAuthorized if neither condition is met.
 *
 * Funds are always sent to the resolved wallet (agentWallet for ERC-8004),
 * regardless of which authorized identity triggers the claim.
 *
 * Prefer claimSocialFees() or claimAgentFees() for simpler call sites.
 *
 * @param identityHash - Type-prefixed hash: keccak256(abi.encode(uint8(resolverType), identifier))
 * @param tokenId - LP NFT token ID to claim from
 * @param resolveData - Resolver type + identity data. Use encodeSocialResolveData() or encodeErc8004ResolveData().
 */
export async function claimByIdentity(
  identityHash: `0x${string}`,
  tokenId: bigint,
  resolveData: `0x${string}`,
  publicClient: PublicClient,
  walletClient: OctopurrWalletClient,
  chainId: SupportedChainId = 56,
): Promise<Result<ClaimResult>> {
  try {
    const { request } = await publicClient.simulateContract({
      address: getLPLockerAddress(chainId),
      abi: LPLocker_abi,
      functionName: 'claimByIdentity',
      args: [identityHash, tokenId, resolveData],
      account: walletClient.account.address,
    });
    const txHash = await walletClient.writeContract({ ...request, account: walletClient.account });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  } catch (e) {
    return { error: parseError(e) };
  }
}

/**
 * @deprecated Use claimByIdentity() instead.
 */
export async function withdrawByIdentity(
  identityHash: `0x${string}`,
  tokenId: bigint,
  resolveData: `0x${string}`,
  publicClient: PublicClient,
  walletClient: OctopurrWalletClient,
  chainId: SupportedChainId = 56,
): Promise<Result<ClaimResult>> {
  return claimByIdentity(identityHash, tokenId, resolveData, publicClient, walletClient, chainId);
}

/**
 * @deprecated Use claimByIdentity() instead.
 */
export async function withdrawDelegated(
  identityHash: `0x${string}`,
  tokenId: bigint,
  resolveData: `0x${string}`,
  publicClient: PublicClient,
  walletClient: OctopurrWalletClient,
  chainId: SupportedChainId = 56,
): Promise<Result<ClaimResult>> {
  return claimByIdentity(identityHash, tokenId, resolveData, publicClient, walletClient, chainId);
}

// ============ Agent Fee State ============

/**
 * Pre-claim state for an ERC-8004 agent identity fee position.
 * Use getAgentFeeState() to read this before calling claimAgentFees().
 */
export type AgentFeeState = {
  /** keccak256(abi.encode(uint8(1), agentId.toString())) */
  identityHash:   `0x${string}`;
  /** Accumulated WBNB in LPLocker for (identityHash, tokenId). 0n = nothing yet. */
  pendingBalance: bigint;
  /** Address receiving claim proceeds. address(0) → must call setAgentWallet() first. */
  agentWallet:    Address;
  /** Current ERC-721 owner of the agent NFT. */
  owner:          Address;
  /** true if canClaim and balance > 0 and not expired. */
  canClaim:       boolean;
  /** true if 1095 days have elapsed — balance reclaimable by protocol. */
  isExpired:      boolean;
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

/**
 * Read all state needed for an ERC-8004 agent fee claim decision.
 *
 * Aggregates: identityHash, pendingBalance, agentWallet, owner, canClaim, isExpired.
 * Returns null if the agent does not exist on-chain.
 *
 * UI decision tree:
 *   agentWallet == address(0)  → show "Set Agent Wallet" CTA (setAgentWallet() required)
 *   !canClaim && !isExpired    → show "No pending fees" (pendingBalance == 0n)
 *   isExpired                  → show expiry warning (protocol can reclaim)
 *   canClaim                   → enable claim button → call claimAgentFees()
 */
export async function getAgentFeeState(
  agentId: bigint,
  tokenId: bigint,
  publicClient: PublicClient,
  chainId: SupportedChainId = 56,
): Promise<AgentFeeState | null> {
  const identityHash = computeErc8004IdentityHash(agentId);

  const [agentInfo, pendingBal, expired] = await Promise.all([
    getAgentInfo(agentId, publicClient, chainId),
    getPendingBalance(identityHash, tokenId, publicClient, chainId),
    isExpired(identityHash, tokenId, publicClient, chainId),
  ]);

  if (!agentInfo) return null;

  const walletSet = agentInfo.agentWallet.toLowerCase() !== ZERO_ADDRESS;

  return {
    identityHash,
    pendingBalance: pendingBal,
    agentWallet:    agentInfo.agentWallet,
    owner:          agentInfo.owner,
    canClaim:       walletSet && pendingBal > 0n && !expired,
    isExpired:      expired,
  };
}

// ============ Convenience Claim Wrappers ============

/**
 * Claim accumulated LP fees for a social identity (telegram, x, etc.).
 *
 * Computes identityHash and resolveData internally.
 * Caller must be the wallet bound to this social identity in SocialResolver.
 *
 * @param platform    - "telegram" | "x"
 * @param recipientId - Platform-specific account ID (e.g. "123456789")
 * @param tokenId     - LP NFT token ID to claim from
 */
export async function claimSocialFees(
  platform: string,
  recipientId: string,
  tokenId: bigint,
  publicClient: PublicClient,
  walletClient: OctopurrWalletClient,
  chainId: SupportedChainId = 56,
): Promise<Result<ClaimResult>> {
  const identityHash = computeSocialIdentityHash(platform, recipientId);
  const resolveData  = encodeSocialResolveData(platform, recipientId);
  return claimByIdentity(identityHash, tokenId, resolveData, publicClient, walletClient, chainId);
}

/**
 * Claim accumulated LP fees for an ERC-8004 agent.
 *
 * Computes identityHash and resolveData internally.
 *
 * Authorization (enforced on-chain by AgentResolver):
 *   - Caller must be agentWallet OR ownerOf(agentId)
 *   - Funds ALWAYS go to agentWallet, not to the caller
 *   - If agentWallet == address(0): tx reverts AgentWalletNotSet
 *
 * Always call getAgentFeeState() first to verify canClaim before submitting TX.
 *
 * @param agentId - ERC-8004 agent NFT token ID
 * @param tokenId - LP NFT token ID to claim from
 */
export async function claimAgentFees(
  agentId: bigint,
  tokenId: bigint,
  publicClient: PublicClient,
  walletClient: OctopurrWalletClient,
  chainId: SupportedChainId = 56,
): Promise<Result<ClaimResult>> {
  const identityHash = computeErc8004IdentityHash(agentId);
  const resolveData  = encodeErc8004ResolveData(agentId);
  return claimByIdentity(identityHash, tokenId, resolveData, publicClient, walletClient, chainId);
}

/**
 * Update a direct fee recipient address (self-admin: only current recipient can call).
 */
export async function updateRecipient(
  tokenId: bigint,
  index: number,
  newRecipient: `0x${string}`,
  publicClient: PublicClient,
  walletClient: OctopurrWalletClient,
  chainId: SupportedChainId = 56,
): Promise<Result<ClaimResult>> {
  try {
    const { request } = await publicClient.simulateContract({
      address: getLPLockerAddress(chainId),
      abi: LPLocker_abi,
      functionName: 'updateRecipient',
      args: [tokenId, BigInt(index), newRecipient],
      account: walletClient.account.address,
    });
    const txHash = await walletClient.writeContract({ ...request, account: walletClient.account });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  } catch (e) {
    return { error: parseError(e) };
  }
}
