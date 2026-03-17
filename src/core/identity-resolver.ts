/**
 * Octopurr Identity Resolver SDK
 *
 * Identity hash computation and resolve-data encoding for the Identity Resolver architecture.
 *
 * Compute identityHash (social identity or ERC-8004 agent → bytes32)
 * and encode resolveData for on-chain resolution via IdentityResolver / SocialResolver.
 *
 * Authorization model (enforced on-chain in SocialResolver.resolveWallet):
 *   Social  (type=0): caller must be the bound wallet.
 *   ERC-8004 (type=1): caller must be agentWallet OR ownerOf(agentId) from the
 *                       ERC-8004 IdentityRegistry. Pass address(0) for read-only queries.
 *
 * Supports BSC Mainnet (56) and BSC Testnet (97).
 */

import { encodePacked, encodeAbiParameters, keccak256, concat, type Hex } from 'viem';

// ============ Resolver Type Constants ============

/** Social identity resolver (telegram, x, etc.) */
export const RESOLVE_SOCIAL = 0;
/** ERC-8004 agent identity resolver */
export const RESOLVE_ERC8004 = 1;

// ============ Text Canonicalization ============

/**
 * Canonicalize text for identity hashing & lookups.
 * - lowercase + trim
 */
export function canonicalizeText(value: string): string {
  return String(value).trim().toLowerCase();
}

/**
 * Canonicalize social identifier/userId/username used for identity hashing & lookups.
 * - lowercase + trim
 * - strips leading @ (one or many)
 */
export function canonicalizeIdentifier(value: string): string {
  return canonicalizeText(value).replace(/^@+/, '');
}

/**
 * Canonicalize a social identifier string "platform:recipientId".
 * Applies canonicalizeText to platform and canonicalizeIdentifier to recipientId.
 */
function canonicalizeSocialIdentifier(identifier: string): string {
  const colonIdx = identifier.indexOf(':');
  if (colonIdx === -1) return canonicalizeText(identifier);
  const platform = identifier.slice(0, colonIdx);
  const recipientId = identifier.slice(colonIdx + 1);
  return `${canonicalizeText(platform)}:${canonicalizeIdentifier(recipientId)}`;
}

// ============ Identity Hash Computation ============

/**
 * Compute identityHash = keccak256(abi.encode(uint8(resolverType), identifier))
 * Matches on-chain IdentityResolver / SocialResolver / AgentResolver computation.
 *
 * Unified format: ALL resolver types hash as keccak256(abi.encode(uint8, string)).
 * abi.encode (not encodePacked) provides collision-safe hashing with length prefixes.
 *
 * Hash includes resolver type prefix for cryptographic namespace isolation.
 * Social hashes (type=0) and agent hashes (type=1) can NEVER collide, even with identical
 * identifier inputs. This prevents cross-path attacks even if attestor is compromised.
 *
 * identifier is normalized (lowercase + trim) before hashing.
 * This ensures consistent hashes regardless of input casing across deploy, bind, and claim flows.
 *
 * @param resolverType - RESOLVE_SOCIAL (0) or RESOLVE_ERC8004 (1)
 * @param identifier - Canonical string identifier.
 *   Social: "platform:recipientId" (e.g. "telegram:123456789")
 *   Agent:  string representation of agentId (e.g. "42")
 *
 * @example
 * computeIdentityHash(RESOLVE_SOCIAL, 'telegram:123456789')  // → 0x...
 * computeIdentityHash(RESOLVE_SOCIAL, 'telegram:Alice')      // same as ('telegram:alice')
 * computeIdentityHash(RESOLVE_ERC8004, '42')                 // agent hash
 */
export function computeIdentityHash(resolverType: number, identifier: string): `0x${string}` {
  const normalized = resolverType === RESOLVE_SOCIAL
    ? canonicalizeSocialIdentifier(identifier)
    : identifier; // agent: agentId string, no canonicalization needed
  return keccak256(encodeAbiParameters(
    [{ type: 'uint8' }, { type: 'string' }],
    [resolverType, normalized]
  ));
}

/**
 * Convenience: compute identityHash for a social identity.
 * @param platform - "telegram", "x", etc.
 * @param recipientId - platform-specific identifier
 */
export function computeSocialIdentityHash(platform: string, recipientId: string): `0x${string}` {
  return computeIdentityHash(RESOLVE_SOCIAL, `${platform}:${recipientId}`);
}

/**
 * Convenience: compute identityHash for an ERC-8004 agent.
 * @param agentId - ERC-8004 agent NFT token ID
 */
export function computeErc8004IdentityHash(agentId: bigint | number | string): `0x${string}` {
  return computeIdentityHash(RESOLVE_ERC8004, String(agentId));
}

// ============ Resolve Data Encoding ============

/**
 * Encode resolveData for social claim path.
 * Format: [uint8(0)] ++ abi.encode(identifier)
 * where identifier = "platform:recipientId" (single canonicalized string).
 */
export function encodeSocialResolveData(platform: string, recipientId: string): Hex {
  const typePrefix = encodePacked(['uint8'], [RESOLVE_SOCIAL]);
  const identifier = `${canonicalizeText(platform)}:${canonicalizeIdentifier(recipientId)}`;
  const params = encodeAbiParameters(
    [{ type: 'string' }],
    [identifier]
  );
  return concat([typePrefix, params]);
}

/**
 * Encode resolveData for ERC-8004 agent claim path.
 * Format: [uint8(1)] ++ abi.encode(agentId)
 *
 * Authorization (enforced on-chain):
 *   - If agentWallet == address(0): reverts AgentWalletNotSet for any real sender.
 *     Call setAgentWallet() on the ERC-8004 IdentityRegistry first.
 *   - Otherwise: sender must be agentWallet OR ownerOf(agentId).
 *     Any other caller reverts SenderNotAuthorized.
 *
 * Use with claimByIdentity() where walletClient.account.address must
 * be one of the two authorized identities above.
 */
export function encodeErc8004ResolveData(agentId: bigint): Hex {
  const typePrefix = encodePacked(['uint8'], [RESOLVE_ERC8004]);
  const params = encodeAbiParameters(
    [{ type: 'uint256' }],
    [agentId]
  );
  return concat([typePrefix, params]);
}
