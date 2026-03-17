/**
 * Octopurr Configuration — Multi-chain (BSC Mainnet + Testnet)
 *
 * Usage:
 *   import { getChainConfig } from './config';
 *   const cfg = getChainConfig(97); // testnet
 *   cfg.pancake.factory, cfg.octopurr.tokenFactory, cfg.wbnb, etc.
 */

// ============ Types ============

export type SupportedChainId = 56 | 97;

/** PancakeSwap V3 infrastructure addresses */
export type PancakeV3Addresses = {
  factory: `0x${string}`;
  positionManager: `0x${string}`;
  /** @deprecated Use universalRouter for swaps. Kept for CreatorBuy contract reference. */
  swapRouter: `0x${string}`;
  quoterV2: `0x${string}`;
  universalRouter: `0x${string}`;
  permit2: `0x${string}`;
};

/** Octopurr contract addresses */
export type OctopurrAddresses = {
  tokenFactory: `0x${string}`;
  lpLocker: `0x${string}`;
  protocolFeeCollector: `0x${string}`;
  /** Identity Resolver router — routes resolution to the correct sub-resolver */
  identityResolver?:  `0x${string}`;
  /** Social identity resolver (platform + recipientId → wallet) */
  socialResolver?:    `0x${string}`;
  /** ERC-8004 agent identity resolver (agentId → wallet) */
  agentResolver?:     `0x${string}`;
  agentDeployer?:     `0x${string}`;
  creatorBuy: `0x${string}`;
  vestingVault: `0x${string}`;
  airdropDistributor: `0x${string}`;
};

/** Complete chain configuration */
export type ChainConfig = {
  chainId: SupportedChainId;
  name: string;
  wbnb: `0x${string}`;
  pancake: PancakeV3Addresses;
  octopurr: OctopurrAddresses;
};

// ============ Chain Registry (embedded constants) ============

import { CHAIN_ADDRESSES } from './addresses.js';

function loadChainConfig(id: SupportedChainId, name: string): ChainConfig {
  const a = (CHAIN_ADDRESSES as Record<string, any>)[String(id)];
  if (!a) throw new Error(`Unsupported chain ${id}. Supported: 56, 97`);
  return {
    chainId: id,
    name,
    wbnb: a.wbnb as `0x${string}`,
    pancake: {
      factory: a.pancake.factory as `0x${string}`,
      positionManager: a.pancake.positionManager as `0x${string}`,
      swapRouter: a.pancake.swapRouter as `0x${string}`,
      quoterV2: a.pancake.quoterV2 as `0x${string}`,
      universalRouter: a.pancake.universalRouter as `0x${string}`,
      permit2: a.pancake.permit2 as `0x${string}`,
    },
    octopurr: {
      tokenFactory: a.tokenFactory as `0x${string}`,
      lpLocker: a.lpLocker as `0x${string}`,
      protocolFeeCollector: a.protocolFeeCollector as `0x${string}`,
      identityResolver: (a.identityResolver ?? undefined) as `0x${string}` | undefined,
      socialResolver:   (a.socialResolver   ?? undefined) as `0x${string}` | undefined,
      agentResolver:    (a.agentResolver    ?? undefined) as `0x${string}` | undefined,
      agentDeployer:    (a.agentDeployer    ?? undefined) as `0x${string}` | undefined,
      creatorBuy: a.creatorBuy as `0x${string}`,
      vestingVault: a.vestingVault as `0x${string}`,
      airdropDistributor: a.airdropDistributor as `0x${string}`,
    },
  };
}

const CHAIN_CONFIGS: Record<SupportedChainId, ChainConfig> = {
  56: loadChainConfig(56, 'BSC Mainnet'),
  97: loadChainConfig(97, 'BSC Testnet'),
};

/**
 * Get complete chain configuration by chain ID.
 * @throws if chainId is not supported or contracts not deployed
 */
export function getChainConfig(chainId: SupportedChainId): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) throw new Error(`Unsupported chain ID: ${chainId}. Supported: 56, 97`);
  if (!config.octopurr.tokenFactory) {
    throw new Error(`Octopurr contracts not yet deployed on chain ${chainId} (${config.name})`);
  }
  return config;
}

/** Check if a chain ID is supported */
export function isSupportedChain(chainId: number): chainId is SupportedChainId {
  return chainId === 56 || chainId === 97;
}

/** True when IdentityResolver (router) is deployed/configured on the chain */
export function isIdentityResolverEnabled(chainId: SupportedChainId): boolean {
  return Boolean(getChainConfig(chainId).octopurr.identityResolver);
}

/** True when SocialResolver is deployed/configured on the chain */
export function isSocialResolverEnabled(chainId: SupportedChainId): boolean {
  return Boolean(getChainConfig(chainId).octopurr.socialResolver);
}

/** True when AgentResolver is deployed/configured on the chain */
export function isAgentResolverEnabled(chainId: SupportedChainId): boolean {
  return Boolean(getChainConfig(chainId).octopurr.agentResolver);
}

/** True when AgentboundTokenDeployer is deployed/configured on the chain */
export function isAgentDeployerEnabled(chainId: SupportedChainId): boolean {
  return Boolean(getChainConfig(chainId).octopurr.agentDeployer);
}

// ============ Constants (chain-independent) ============


/** Universal Router command bytes */
export const UR_COMMANDS = {
  V3_SWAP_EXACT_IN: 0x00,
  V3_SWAP_EXACT_OUT: 0x01,
  PERMIT2_TRANSFER_FROM: 0x02,
  PERMIT2_PERMIT_BATCH: 0x03,
  SWEEP: 0x04,
  TRANSFER: 0x05,
  PAY_PORTION: 0x06,
  V2_SWAP_EXACT_IN: 0x08,
  V2_SWAP_EXACT_OUT: 0x09,
  PERMIT2_PERMIT: 0x0a,
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
  PERMIT2_TRANSFER_FROM_BATCH: 0x0d,
  BALANCE_CHECK_ERC20: 0x0e,
} as const;

/** Special addresses for Universal Router */
export const UR_ADDRESS = {
  MSG_SENDER: '0x0000000000000000000000000000000000000001' as `0x${string}`,
  ADDRESS_THIS: '0x0000000000000000000000000000000000000002' as `0x${string}`,
} as const;

/** Interface fee: 1% (100 BPS) charged on swaps via Octopurr */
export const INTERFACE_FEE_BPS = 100n;

/** Pool configuration constants (same for all chains) */
export const POOL_CONFIG = {
  totalSupply: 1_000_000_000n * 10n ** 18n,
  totalSupplyNumber: 1_000_000_000,
  feeTier: 10_000 as const,
  tickSpacing: 200,
  protocolBps: 2_000,
  recipientsBps: 8_000,
  bps: 10_000,
  maxExtensions: 10,
  maxExtensionBps: 9_000, // Must match TokenFactory.MAX_EXTENSION_BPS
  maxRecipients: 20, // Must match LPLocker.MAX_RECIPIENTS
} as const;

/** Chain IDs */
export const CHAIN_IDS = {
  bsc: 56 as const,
  bscTestnet: 97 as const,
} as const;
