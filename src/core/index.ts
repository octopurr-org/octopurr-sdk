/**
 * Octopurr SDK — PancakeSwap V3 Token Launchpad (BSC)
 */

// Deploy
export {
  buildDeployConfig,
  simulateDeploy,
  deployToken,
  registerToken,
  getDeployRequestStatus,
  getDeployQueueStatus,
  getDeploymentInfo,
  type DeployTokenParams,
} from './deploy.js';

// Fees (LPLocker)
export {
  getPosition,
  claimFees,
  claimFeesMulti,
  updateRecipient,
  getPendingBalance,
  // Claim by identity
  claimByIdentity,
  claimSocialFees,
  claimAgentFees,
  // Agent fee state
  getAgentFeeState,
  // Deprecated aliases
  /** @deprecated Use claimByIdentity instead */
  withdrawByIdentity,
  /** @deprecated Use claimByIdentity instead */
  withdrawDelegated,
  isExpired,
  type LockedPosition,
  type AgentFeeState,
} from './fees.js';

// Swap
export {
  buyToken,
  sellToken,
  ensureApproval,
  ensurePermit2Approval,
  getPermit2Nonce,
  buildPermit2TypedData,
  type SwapDirection,
  type SwapParams,
} from './swap.js';

// Pool
export {
  getPoolAddress,
  getPoolPrice,
  getMarketCapBNB,
  getMarketCapUSD,
} from './pool.js';

// Identity Resolver — hash computation and resolve-data encoding (new)
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
} from './identity-resolver.js';

// Social Resolver — contract read operations (new)
export {
  getSocialResolverAddress,
  getBoundWallet,
  getPendingWalletChange,
  isNonceUsed,
  getSocialResolverRoles,
  type SocialResolverRoles,
  type PendingWalletChange,
} from './social-resolver.js';

// Agent Deployer (ERC-8004 + Octopurr atomic deploy)
export {
  deployAgentboundToken,
  constructAgentDataUri,
  EIP8004_REGISTRATION_TYPE,
  parseAgentboundTokenDeployedEvent,
  parseAgentContext,
  getAgentContext,
  getRegistrationFee,
  getAgentInfo,
  getIdentityRegistryAddress,
  buildSetAgentWalletTypedData,
  setAgentWallet,
  type DeployAgentWithTokenParams,
  type AgentMetadata,
  type AgentDeployResult,
  type AgentInfo,
  type AgentContextResult,
} from './agent-deployer.js';

// Extensions
export {
  encodeCreatorBuyData,
  encodeVestingVaultData,
  encodeAirdropData,
  buildCreatorBuyExtension,
  buildVestingVaultExtension,
  buildAirdropExtension,
  type CreatorBuyParams,
  type VestingVaultParams,
  type AirdropDistributorParams,
  type ExtensionConfig,
} from './extensions.js';
