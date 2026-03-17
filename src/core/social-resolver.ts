/**
 * Octopurr SocialResolver SDK
 *
 * Read operations for the SocialResolver contract:
 * - Get bound wallet for an identityHash
 * - Get pending wallet change state
 * - Check nonce usage
 * - Get contract roles (owner, admin, attestor)
 *
 * Supports BSC Mainnet (56) and BSC Testnet (97).
 */

import { type PublicClient, type Address } from 'viem';
import { SocialResolver_abi } from '../abi/SocialResolver.js';
import { getChainConfig, type SupportedChainId } from '../config/index.js';

// ============ Types ============

export type SocialResolverRoles = {
  owner: Address;
  attestor: Address;
};

export type PendingWalletChange = {
  newWallet: Address;
  executeAfter: bigint;
};

// ============ Helpers ============

export function getSocialResolverAddress(chainId: SupportedChainId): Address {
  const cfg = getChainConfig(chainId);
  const addr = cfg.octopurr.socialResolver;
  if (!addr) throw new Error(`SocialResolver not deployed on chain ${chainId}`);
  return addr;
}

// ============ Read Functions ============

/**
 * Get the EVM wallet bound to an identityHash.
 * Returns zero address if not yet bound.
 */
export async function getBoundWallet(
  identityHash: `0x${string}`,
  publicClient: PublicClient,
  chainId: SupportedChainId = 56,
): Promise<Address> {
  const resolver = getSocialResolverAddress(chainId);
  return publicClient.readContract({
    address: resolver,
    abi: SocialResolver_abi,
    functionName: 'boundWallet',
    args: [identityHash],
  }) as Promise<Address>;
}

/**
 * Get pending wallet change info for an identityHash.
 * Returns null if no pending change.
 */
export async function getPendingWalletChange(
  identityHash: `0x${string}`,
  publicClient: PublicClient,
  chainId: SupportedChainId = 56,
): Promise<PendingWalletChange | null> {
  const resolver = getSocialResolverAddress(chainId);
  const result = await publicClient.readContract({
    address: resolver,
    abi: SocialResolver_abi,
    functionName: 'pendingWalletChange',
    args: [identityHash],
  }) as readonly [Address, bigint];

  const ZERO = '0x0000000000000000000000000000000000000000';
  if ((result[0] as string).toLowerCase() === ZERO) return null;
  return { newWallet: result[0], executeAfter: result[1] };
}

/**
 * Check if a nonce has been used for an identityHash.
 */
export async function isNonceUsed(
  identityHash: `0x${string}`,
  nonce: bigint,
  publicClient: PublicClient,
  chainId: SupportedChainId = 56,
): Promise<boolean> {
  const resolver = getSocialResolverAddress(chainId);
  return publicClient.readContract({
    address: resolver,
    abi: SocialResolver_abi,
    functionName: 'usedNonces',
    args: [identityHash, nonce],
  }) as Promise<boolean>;
}

/**
 * Get SocialResolver role addresses (owner, admin, attestor).
 */
export async function getSocialResolverRoles(
  publicClient: PublicClient,
  chainId: SupportedChainId = 56,
): Promise<SocialResolverRoles> {
  const resolver = getSocialResolverAddress(chainId);
  const [owner, attestor] = await Promise.all([
    publicClient.readContract({ address: resolver, abi: SocialResolver_abi, functionName: 'owner' }),
    publicClient.readContract({ address: resolver, abi: SocialResolver_abi, functionName: 'attestor' }),
  ]);
  return {
    owner: owner as Address,
    attestor: attestor as Address,
  };
}
