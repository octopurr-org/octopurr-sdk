/**
 * Octopurr SDK — PancakeSwap V3 Token Launchpad on BSC
 *
 * Supports BSC Mainnet (56) and BSC Testnet (97).
 *
 * @example
 * ```ts
 * import { core, config } from '@octopurr/sdk';
 *
 * // Get chain config (addresses auto-resolved)
 * const cfg = config.getChainConfig(97); // testnet
 *
 * // Deploy a token
 * const result = await core.deployToken({
 *   token: { name: 'MyToken', symbol: 'MTK' },
 *   marketCapBNB: 30,
 *   recipients: [{ address: '0x...', bps: 10_000 }],
 *   chainId: 97, // testnet
 * }, publicClient, walletClient);
 * ```
 */

// Namespaced exports
export * as core from './core/index.js';
export * as config from './config/index.js';
export * as utils from './utils/index.js';
export * as abi from './abi/index.js';

// Direct re-exports for convenience
export {
  getChainConfig, isSupportedChain,
  isIdentityResolverEnabled, isSocialResolverEnabled, isAgentResolverEnabled,
  isAgentDeployerEnabled,
  POOL_CONFIG, INTERFACE_FEE_BPS, UR_COMMANDS, UR_ADDRESS, CHAIN_IDS,
  type SupportedChainId, type ChainConfig, type OctopurrAddresses, type PancakeV3Addresses,
} from './config/index.js';
export { OctopurrError } from './utils/types.js';
export {
  deployAgentboundToken,
  constructAgentDataUri,
  parseAgentboundTokenDeployedEvent,
  parseAgentContext,
  getAgentContext,
  getRegistrationFee,
  getAgentInfo,
  getIdentityRegistryAddress,
  buildSetAgentWalletTypedData,
  setAgentWallet,
  registerAgentWithToken,
  type DeployAgentWithTokenParams,
  type RegisterAgentWithTokenParams,
  type RegisterAgentWithTokenResult,
  type AgentMetadata,
  type AgentDeployResult,
  type AgentInfo,
  type AgentContextResult,
} from './core/agent-deployer.js';
export { ERC8004_IDENTITY_REGISTRY } from './config/erc8004.js';
export { marketCapToTick, tickToMarketCap, marketCapUSDToTick, tickToMarketCapUSD, getDefaultTickRange } from './utils/market-cap.js';
// Identity Resolver (new)
export {
  canonicalizeText,
  canonicalizeIdentifier,
  computeIdentityHash,
  computeSocialIdentityHash,
  computeErc8004IdentityHash,
  encodeSocialResolveData,
  encodeErc8004ResolveData,
  RESOLVE_SOCIAL,
  RESOLVE_ERC8004,
} from './core/identity-resolver.js';

// Social Resolver (new)
export {
  getSocialResolverAddress,
  getBoundWallet,
  getPendingWalletChange,
  isNonceUsed,
  getSocialResolverRoles,
  type SocialResolverRoles,
  type PendingWalletChange,
} from './core/social-resolver.js';

// Fee management
export {
  // Position queries
  getPosition,
  getPendingBalance,
  isExpired,
  // Trigger LP fee distribution
  claimFees,
  claimFeesMulti,
  // Claim identity fees
  claimByIdentity,
  claimSocialFees,
  claimAgentFees,
  // Agent fee state
  getAgentFeeState,
  // Direct recipient admin
  updateRecipient,
  // Deprecated aliases
  /** @deprecated Use claimByIdentity() */
  withdrawByIdentity,
  /** @deprecated Use claimByIdentity() */
  withdrawDelegated,
  type LockedPosition,
  type AgentFeeState,
} from './core/fees.js';


