/**
 * ERC-8004 IdentityRegistry constants.
 *
 * These are protocol-level addresses for the ERC-8004 standard (external),
 * NOT Octopurr-owned contracts. Stored here as standalone constants,
 * separate from OctopurrAddresses (octopurr-addresses repo scope).
 *
 * Deployed by the ERC-8004 authors:
 *   Mainnet:  0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 *   Testnet:  0x8004A818BFB912233c491871b3d84c89A494BD9e
 */

import type { SupportedChainId } from './index.js';

/** ERC-8004 IdentityRegistry addresses by chain ID. */
export const ERC8004_IDENTITY_REGISTRY = {
  56: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as `0x${string}`,
  97: '0x8004A818BFB912233c491871b3d84c89A494BD9e' as `0x${string}`,
} as const satisfies Record<SupportedChainId, `0x${string}`>;

/**
 * Returns the ERC-8004 IdentityRegistry address for a given chain.
 * @throws if chainId is not supported
 */
export function getIdentityRegistryAddress(chainId: SupportedChainId): `0x${string}` {
  const addr = ERC8004_IDENTITY_REGISTRY[chainId];
  if (!addr) throw new Error(`ERC-8004 IdentityRegistry not available on chain ${chainId}`);
  return addr;
}
