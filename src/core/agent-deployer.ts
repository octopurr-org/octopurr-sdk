/**
 * Octopurr Agent Deployer SDK
 *
 * Atomic ERC-8004 agent registration + token deployment via AgentboundTokenDeployer contract.
 * Deploys an agent identity (ERC-721 NFT) and a token with the agent as a fee recipient
 * in a single transaction.
 *
 * Supports BSC Mainnet (56) and BSC Testnet (97).
 */

import {
  type PublicClient,
  type Address,
  parseEventLogs,
  encodeAbiParameters,
  type Log,
} from 'viem';
import { AgentboundTokenDeployer_abi } from '../abi/AgentboundTokenDeployer.js';
import { IdentityRegistry_abi } from '../abi/IdentityRegistry.js';
import { TokenLauncher_abi } from '../abi/TokenLauncher.js';
import { getChainConfig, type SupportedChainId, POOL_CONFIG } from '../config/index.js';
import { getIdentityRegistryAddress } from '../config/erc8004.js';
import { parseError } from '../utils/errors.js';
import { marketCapToTick, getDefaultTickRange } from '../utils/market-cap.js';
import { computeErc8004IdentityHash } from './identity-resolver.js';
import { type DeployTokenParams } from './deploy.js';
import type { OctopurrWalletClient, Result } from '../utils/types.js';
import type { ExtensionConfig } from './extensions.js';

// ============ Types ============

/** Parameters for deploying an agent + token atomically */
export type DeployAgentWithTokenParams = {
  /** Agent metadata for on-chain storage */
  agent: AgentMetadata;
  /** Token deployment parameters (same as regular deploy, minus chainId handled separately) */
  token: DeployTokenParams;
  /** Fee BPS allocated to the agent (1–10000). Must sum with token.recipients + token.identityRecipients to 10000. */
  agentBps: number;
  /**
   * Address to receive the agent NFT after deploy. Defaults to msg.sender (deployer wallet) if not set.
   * Useful for deploying on behalf of another wallet or transferring ownership immediately.
   */
  nftRecipient?: `0x${string}`;
};

/** Agent metadata stored on-chain as data URI (EIP-8004 format) */
export type AgentMetadata = {
  /** Agent display name (required) */
  name: string;
  /** Agent description */
  description?: string;
  /** Agent image URL */
  image?: string;
  /**
   * Raw EIP-8004 JSON metadata (user-uploaded).
   * When provided, this object is serialized as-is into the data URI.
   * name/description/image from top-level fields are merged in if not already
   * present in rawJson, ensuring required fields are always set.
   */
  rawJson?: Record<string, unknown>;
};

/** Result of a successful agent + token deployment */
export type AgentDeployResult = {
  /** Transaction hash */
  txHash: `0x${string}`;
  /** Registered agent ID (ERC-721 NFT token ID) */
  agentId: bigint;
  /** Deployed token contract address */
  tokenAddress: `0x${string}`;
  /** Agent's identity hash in LPLocker fee config */
  identityHash: `0x${string}`;
};

/** Agent info read from IdentityRegistry */
export type AgentInfo = {
  agentId: bigint;
  owner: Address;
  agentWallet: Address;
  tokenURI: string;
  boundToken: Address | null;
};

// ============ ERC-8004 Constants ============

/** EIP-8004 registration type URI — always injected as first field in agentUri JSON */
export const EIP8004_REGISTRATION_TYPE = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';

/** Get ERC-8004 IdentityRegistry address for a chain. Re-exported for SDK consumers. */
export { getIdentityRegistryAddress };

// ============ Helpers ============

function getAgentDeployerAddress(chainId: SupportedChainId): Address {
  const cfg = getChainConfig(chainId);
  const addr = cfg.octopurr.agentDeployer;
  if (!addr) throw new Error(`AgentboundTokenDeployer not deployed on chain ${chainId}`);
  return addr;
}

/**
 * Construct a data URI for agent metadata (stored on-chain in IdentityRegistry).
 *
 * Format: `data:application/json;base64,<base64-encoded JSON>`
 *
 * The metadata follows a structure similar to ERC-721 tokenURI metadata:
 * - name (required): agent display name
 * - description: agent description
 * - image: agent image URL
 * - external_url: agent external URL
 * - properties: additional key-value properties
 *
 * @example
 * ```ts
 * const uri = constructAgentDataUri({
 *   name: 'TradingBot',
 *   description: 'An autonomous trading agent',
 *   image: 'https://example.com/bot.png',
 * });
 * // → 'data:application/json;base64,eyJuYW1lIjoiVHJhZGluZ0JvdCIsImRlc2NyaXB0aW9uIjoiQW4gYXV0b25vbW91cyB0cmFkaW5nIGFnZW50IiwiaW1hZ2UiOiJodHRwczovL2V4YW1wbGUuY29tL2JvdC5wbmcifQ=='
 * ```
 */
export function constructAgentDataUri(metadata: AgentMetadata): string {
  if (!metadata.name?.trim()) {
    throw new Error('Agent name is required');
  }

  let content: Record<string, unknown>;

  if (metadata.rawJson) {
    // User uploaded full EIP-8004 JSON — use as-is, merge required fields if missing
    content = { ...metadata.rawJson };

    // Always ensure name is set (required by EIP-8004)
    if (!content.name) content.name = metadata.name.trim();
    // Merge description/image if not in rawJson but provided at top level
    if (!content.description && metadata.description?.trim()) content.description = metadata.description.trim();
    if (!content.image && metadata.image?.trim())              content.image       = metadata.image.trim();
  } else {
    // Build from top-level fields
    content = { name: metadata.name.trim() };
    if (metadata.description?.trim()) content.description = metadata.description.trim();
    if (metadata.image?.trim())       content.image       = metadata.image.trim();
  }

  // Strip any user-provided `type` — we always control this field
  delete content.type;

  // EIP-8004 compliance: `type` is always the first key
  const json: Record<string, unknown> = {
    type: EIP8004_REGISTRATION_TYPE,
    ...content,
  };

  const jsonString = JSON.stringify(json);
  const base64 = btoa(unescape(encodeURIComponent(jsonString))); // UTF-8 safe
  return `data:application/json;base64,${base64}`;
}

// ============ Context Helpers ============

/** Result of parsing a token's context field for agent binding */
export type AgentContextResult = {
  /** EIP standard identifier (e.g. "erc8004") */
  standard: string;
  /** ERC-8004 agent ID bound to this token */
  agentId: bigint;
};

/**
 * Parse a token's `context()` field to extract the bound agent ID.
 *
 * Format written by AgentboundTokenDeployer: `"erc8004:<agentId>"`
 * Regular (non-agent-bound) tokens have `context = ""`.
 *
 * @param context - Value returned by `token.context()` on-chain
 * @returns Parsed result or null if not an agent-bound token
 *
 * @example
 * ```ts
 * const ctx = await publicClient.readContract({
 *   address: tokenAddress,
 *   abi: TokenLauncher_abi,
 *   functionName: 'context',
 * });
 * const result = parseAgentContext(ctx);
 * if (result) {
 *   console.log(`Token bound to ERC-8004 agent #${result.agentId}`);
 * }
 * ```
 */
export function parseAgentContext(context: string): AgentContextResult | null {
  if (!context || !context.includes(':')) return null;

  const colonIdx = context.indexOf(':');
  const standard = context.slice(0, colonIdx);
  const idStr = context.slice(colonIdx + 1);

  if (!standard || !idStr) return null;

  try {
    const agentId = BigInt(idStr);
    if (agentId <= 0n) return null;
    return { standard, agentId };
  } catch {
    return null;
  }
}

/**
 * Read and parse the agent context from a deployed token contract.
 *
 * Combines `publicClient.readContract` + `parseAgentContext` in one call.
 *
 * @param tokenAddress - ERC-20 token contract address
 * @param publicClient - Viem public client
 * @returns Parsed agent context or null if not agent-bound / token has no context
 */
export async function getAgentContext(
  tokenAddress: Address,
  publicClient: PublicClient,
): Promise<AgentContextResult | null> {
  try {
    const context = await publicClient.readContract({
      address: tokenAddress,
      abi: TokenLauncher_abi,
      functionName: 'context',
    }) as string;
    return parseAgentContext(context);
  } catch {
    return null;
  }
}

/**
 * Parse AgentboundTokenDeployed event from a transaction receipt.
 *
 * @param logs - Transaction receipt logs
 * @returns Parsed event data or null if not found
 *
 * @example
 * ```ts
 * const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
 * const event = parseAgentboundTokenDeployedEvent(receipt.logs);
 * if (event) {
 *   console.log(`Agent ${event.agentId} deployed token ${event.tokenAddress}`);
 * }
 * ```
 */
export function parseAgentboundTokenDeployedEvent(logs: Log[]): AgentDeployResult | null {
  const parsed = parseEventLogs({
    abi: AgentboundTokenDeployer_abi,
    eventName: 'AgentboundTokenDeployed',
    logs,
  });

  if (parsed.length === 0) return null;

  const event = parsed[0].args;
  const identityHash = event.identityHash as `0x${string}`;
  return {
    txHash: logs[0]?.transactionHash ?? '0x',
    agentId: event.agentId,
    tokenAddress: event.tokenAddress,
    identityHash,
  };
}

// ============ Core Functions ============

/**
 * Deploy an ERC-8004 agent and an Octopurr token atomically in one transaction.
 *
 * The agent is registered on the ERC-8004 IdentityRegistry, and its identityHash
 * is automatically appended to the token's fee recipients. After deployment:
 * - Agent NFT is owned by the caller
 * - agentWallet is cleared (ERC-8004 clears on transfer)
 * - Token fees accumulate in LPLocker for the agent's identityHash
 * - User must call setAgentWallet() separately to enable fee withdrawal
 *
 * @param params - Agent metadata, token config, and agent fee BPS
 * @param publicClient - Viem public client
 * @param walletClient - Viem wallet client with account
 * @param chainId - Target chain (default: 56)
 *
 * @example
 * ```ts
 * const result = await deployAgentboundToken({
 *   agent: { name: 'TradingBot', description: 'Autonomous trader' },
 *   token: {
 *     token: { name: 'BotToken', symbol: 'BOT' },
 *     marketCapBNB: 30,
 *     recipients: [{ address: '0x...', bps: 4000 }],
 *   },
 *   agentBps: 6000,
 * }, publicClient, walletClient, 97);
 * ```
 */
export async function deployAgentboundToken(
  params: DeployAgentWithTokenParams,
  publicClient: PublicClient,
  walletClient: OctopurrWalletClient,
  chainId: SupportedChainId = 56,
): Promise<Result<AgentDeployResult>> {
  try {
    const agentDeployerAddr = getAgentDeployerAddress(chainId);
    const account = walletClient.account.address;
    const cfg = getChainConfig(chainId);

    // Build agent URI
    const agentURI = constructAgentDataUri(params.agent);

    // Validate agentBps
    if (params.agentBps <= 0 || params.agentBps > POOL_CONFIG.bps) {
      throw new Error(`agentBps must be between 1 and ${POOL_CONFIG.bps}, got ${params.agentBps}`);
    }

    // Build token deployment config (agent delegate will be appended by the contract)
    // Adjust totalBps validation: token params should NOT include agentBps
    const tokenParams: DeployTokenParams = {
      ...params.token,
      chainId,
    };

    // Validate BPS sum: existing recipients + identity recipients + agentBps must == 10000
    const directBps = (tokenParams.recipients ?? []).reduce((sum, r) => sum + r.bps, 0);
    const identityBps = [
      ...(tokenParams.identityRecipients ?? []),
    ].reduce((sum, r) => sum + r.bps, 0);
    const totalBps = directBps + identityBps + params.agentBps;
    if (totalBps !== POOL_CONFIG.bps) {
      throw new Error(
        `Total BPS (recipients ${directBps} + identityRecipients ${identityBps} + agent ${params.agentBps}) must equal ${POOL_CONFIG.bps}, got ${totalBps}`,
      );
    }

    // Build the on-chain config struct (with BPS = directBps + identityBps, NOT including agentBps)
    // The contract will append agentBps and validate total == 10000
    const deployConfig = buildDeployConfigForAgent(tokenParams, account);

    // Calculate total msg.value = registrationFee + extension msgValues
    const registrationFee = await publicClient.readContract({
      address: agentDeployerAddr,
      abi: AgentboundTokenDeployer_abi,
      functionName: 'registrationFee',
    }) as bigint;

    const extensionMsgValue = (tokenParams.extensions ?? []).reduce(
      (sum, e) => sum + e.msgValue, 0n,
    );
    const totalMsgValue = registrationFee + extensionMsgValue;

    // Generate random salt
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const salt = `0x${Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;

    // Simulate first
    await publicClient.simulateContract({
      address: agentDeployerAddr,
      abi: AgentboundTokenDeployer_abi,
      functionName: 'deployAgentboundToken',
      args: [agentURI, deployConfig, salt, params.agentBps, params.nftRecipient ?? '0x0000000000000000000000000000000000000000'],
      value: totalMsgValue,
      account,
    });

    // Estimate gas
    const gasEstimate = await publicClient.estimateContractGas({
      address: agentDeployerAddr,
      abi: AgentboundTokenDeployer_abi,
      functionName: 'deployAgentboundToken',
      args: [agentURI, deployConfig, salt, params.agentBps, params.nftRecipient ?? '0x0000000000000000000000000000000000000000'],
      value: totalMsgValue,
      account,
    });

    // Send transaction
    const txHash = await walletClient.writeContract({
      address: agentDeployerAddr,
      abi: AgentboundTokenDeployer_abi,
      functionName: 'deployAgentboundToken',
      args: [agentURI, deployConfig, salt, params.agentBps, params.nftRecipient ?? '0x0000000000000000000000000000000000000000'],
      value: totalMsgValue,
      gas: (gasEstimate * 130n) / 100n, // 30% buffer (higher than normal due to batch complexity)
      account: walletClient.account,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status === 'reverted') {
      return { error: parseError(new Error(`Transaction reverted: ${txHash}`)) };
    }

    // Parse events
    const result = parseAgentboundTokenDeployedEvent(receipt.logs);
    if (!result) {
      return { error: parseError(new Error('AgentboundTokenDeployed event not found in receipt')) };
    }

    return { ...result, txHash };
  } catch (e) {
    return { error: parseError(e) };
  }
}

/**
 * Build the DeploymentConfig struct for the AgentDeployer contract.
 * Similar to buildDeployConfig but does NOT include agentBps in the BPS validation
 * (the contract handles appending the agent delegate and validating total == 10000).
 */
function buildDeployConfigForAgent(
  params: DeployTokenParams,
  deployer: `0x${string}`,
) {
  // Token validation
  if (!params.token.name?.trim() || params.token.name.length > 100) {
    throw new Error('Token name is required and must be <= 100 characters');
  }
  if (!params.token.symbol?.trim() || params.token.symbol.length > 20) {
    throw new Error('Token symbol is required and must be <= 20 characters');
  }

  const delegates = [
    ...(params.identityRecipients ?? []).map((r) => ({ identityHash: r.identityHash, bps: r.bps })),
  ];
  const MAX_RECIPIENTS = POOL_CONFIG.maxRecipients;
  // +1 for the agent identity that will be appended by the contract
  const combinedCount = (params.recipients ?? []).length + delegates.length + 1;
  if (combinedCount > MAX_RECIPIENTS) {
    throw new Error(
      `Total recipients (wallet + identity + agent) must not exceed ${MAX_RECIPIENTS}, got ${combinedCount}`,
    );
  }

  const cfg = getChainConfig(params.chainId ?? 56);

  const startingTick = marketCapToTick(params.marketCapBNB);
  const { tickLower, tickUpper } = params.tickRange ?? getDefaultTickRange(startingTick);

  // Validate tick parameters
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

  // On-chain metadata handling (same logic as deploy.ts)
  const emitMeta = params.onchainMetadata === true;
  let image = '';
  let metadata = '';
  if (emitMeta) {
    image = (params.token.image ?? '').slice(0, 256);
    metadata = (params.token.metadata ?? '').slice(0, 2048);
  }

  return {
    tokenConfig: {
      name: params.token.name,
      symbol: params.token.symbol,
      tokenAdmin: '0x0000000000000000000000000000000000000000' as `0x${string}`, // Always zero for agent-bound tokens
      image,
      metadata,
      context: '',  // AgentboundTokenDeployer overrides with "erc8004:<agentId>" on-chain
    },
    poolConfig: {
      quoteToken: cfg.wbnb,
      fee: POOL_CONFIG.feeTier,
      tickIfToken0IsBase: startingTick,
      tickLower,
      tickUpper,
    },
    feeConfig: {
      recipients: (params.recipients ?? []).map((r) => r.address as `0x${string}`),
      recipientBps: (params.recipients ?? []).map((r) => r.bps),
      identityRecipients: delegates.map((r) => r.identityHash),
      identityBps: delegates.map((r) => r.bps),
    },
    extensionConfigs: params.extensions ?? [],
  };
}

// ============ Read Functions ============

/**
 * Get agent registration fee from the AgentDeployer contract.
 */
export async function getRegistrationFee(
  publicClient: PublicClient,
  chainId: SupportedChainId = 56,
): Promise<bigint> {
  const addr = getAgentDeployerAddress(chainId);
  return publicClient.readContract({
    address: addr,
    abi: AgentboundTokenDeployer_abi,
    functionName: 'registrationFee',
  }) as Promise<bigint>;
}

/**
 * Get agent info from the ERC-8004 IdentityRegistry.
 *
 * @param agentId - Agent NFT token ID
 * @param chainId - Target chain
 * @returns Agent info or null if agent doesn't exist
 */
export async function getAgentInfo(
  agentId: bigint,
  publicClient: PublicClient,
  chainId: SupportedChainId = 56,
): Promise<AgentInfo | null> {
  const registry = getIdentityRegistryAddress(chainId);

  try {
    const [owner, agentWallet, tokenURI, boundTokenBytes] = await Promise.all([
      publicClient.readContract({
        address: registry,
        abi: IdentityRegistry_abi,
        functionName: 'ownerOf',
        args: [agentId],
      }) as Promise<Address>,
      publicClient.readContract({
        address: registry,
        abi: IdentityRegistry_abi,
        functionName: 'getAgentWallet',
        args: [agentId],
      }) as Promise<Address>,
      publicClient.readContract({
        address: registry,
        abi: IdentityRegistry_abi,
        functionName: 'tokenURI',
        args: [agentId],
      }) as Promise<string>,
      publicClient.readContract({
        address: registry,
        abi: IdentityRegistry_abi,
        functionName: 'getMetadata',
        args: [agentId, 'boundToken'],
      }).catch(() => null) as Promise<`0x${string}` | null>,
    ]);

    let boundToken: Address | null = null;
    if (boundTokenBytes && boundTokenBytes.length >= 42) {
      // bytes20 → address: take first 20 bytes (0x + 40 hex chars)
      boundToken = ('0x' + boundTokenBytes.slice(2, 42)) as Address;
      if (boundToken === '0x0000000000000000000000000000000000000000') {
        boundToken = null;
      }
    }

    return {
      agentId,
      owner,
      agentWallet,
      tokenURI,
      boundToken,
    };
  } catch {
    return null;
  }
}

// ============ Agent Wallet Management ============

/**
 * Build EIP-712 typed data for setAgentWallet().
 *
 * The newWallet must sign this typed data to prove ownership before being set as agentWallet.
 * Pass the resulting signature to setAgentWallet().
 *
 * EIP-712 domain:
 *   name:              "ERC8004IdentityRegistry"  (from contract name() bytecode)
 *   version:           "1"
 *   chainId:           target chain
 *   verifyingContract: IdentityRegistry address
 *
 * ⚠️ WARNING: The exact `SetAgentWallet` type struct has not been verified against the deployed
 * contract via a live transaction. If setAgentWallet() reverts with "invalid signature",
 * check the ERC-8004 reference implementation for the exact typehash string.
 * The most likely struct is: SetAgentWallet(uint256 agentId, address newWallet, uint256 deadline)
 *
 * Usage:
 *   const typedData = buildSetAgentWalletTypedData(agentId, newWallet, deadline, chainId);
 *   const signature = await newWalletClient.signTypedData(typedData);
 *   await setAgentWallet(agentId, newWallet, deadline, signature, publicClient, ownerWalletClient, chainId);
 */
export function buildSetAgentWalletTypedData(
  agentId: bigint,
  newWallet: `0x${string}`,
  deadline: bigint,
  chainId: SupportedChainId = 56,
) {
  const registry = getIdentityRegistryAddress(chainId);

  return {
    domain: {
      name:              'ERC8004IdentityRegistry' as const,
      version:           '1' as const,
      chainId:           Number(chainId),
      verifyingContract: registry,
    },
    types: {
      SetAgentWallet: [
        { name: 'agentId',   type: 'uint256' },
        { name: 'newWallet', type: 'address' },
        { name: 'deadline',  type: 'uint256' },
      ],
    },
    primaryType: 'SetAgentWallet' as const,
    message: {
      agentId,
      newWallet,
      deadline,
    },
  };
}

/**
 * Set the agentWallet for an ERC-8004 agent on the IdentityRegistry.
 *
 * agentWallet is the address that:
 *   1. Receives LP fee proceeds when claimAgentFees() is called.
 *   2. Is authorized to trigger claimAgentFees() (alongside ownerOf(agentId)).
 *
 * Requirements:
 *   - walletClient must be the current ownerOf(agentId) (who submits the TX)
 *   - signature must be signed by newWallet via buildSetAgentWalletTypedData()
 *     (proves that newWallet consents to being the agent wallet)
 *   - deadline must not have passed
 *
 * When the agent NFT is transferred, agentWallet is automatically cleared.
 * The new owner must call setAgentWallet() again.
 *
 * ⚠️ Uses buildSetAgentWalletTypedData() — verify signature structure before mainnet use.
 *
 * @param agentId   - ERC-8004 agent NFT token ID
 * @param newWallet - The wallet to set as agentWallet (must have signed typed data)
 * @param deadline  - Unix timestamp after which signature is invalid
 * @param signature - EIP-712 signature from newWallet (use buildSetAgentWalletTypedData)
 */
export async function setAgentWallet(
  agentId: bigint,
  newWallet: `0x${string}`,
  deadline: bigint,
  signature: `0x${string}`,
  publicClient: PublicClient,
  walletClient: OctopurrWalletClient,
  chainId: SupportedChainId = 56,
): Promise<Result<{ txHash: `0x${string}` }>> {
  const registry = getIdentityRegistryAddress(chainId);
  try {
    const { request } = await publicClient.simulateContract({
      address: registry,
      abi: IdentityRegistry_abi,
      functionName: 'setAgentWallet',
      args: [agentId, newWallet, deadline, signature],
      account: walletClient.account.address,
    });
    const txHash = await walletClient.writeContract({ ...request, account: walletClient.account });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  } catch (e) {
    return { error: parseError(e) };
  }
}
