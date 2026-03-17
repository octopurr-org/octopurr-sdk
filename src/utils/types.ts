import type { Account, Chain, PublicClient, Transport, WalletClient } from 'viem';

/** Wallet client with account bound */
export type OctopurrWalletClient = WalletClient<Transport, Chain, Account>;

/** Result type — success or error, never both */
export type Result<T> =
  | (T & { error?: undefined })
  | ({ [K in keyof T]?: undefined } & { error: OctopurrError });

/** Structured error */
export class OctopurrError extends Error {
  constructor(
    public readonly type: 'revert' | 'funds' | 'network' | 'unknown',
    public readonly label: string,
    public readonly cause?: Error,
  ) {
    super(label);
    this.name = 'OctopurrError';
  }

  static revert(label: string, cause?: Error): OctopurrError {
    return new OctopurrError('revert', label, cause);
  }

  static funds(cause?: Error): OctopurrError {
    return new OctopurrError('funds', 'Insufficient funds', cause);
  }

  static unknown(cause?: Error): OctopurrError {
    return new OctopurrError('unknown', cause?.message ?? 'Unknown error', cause);
  }
}

/** Token deployment parameters (user-facing, simplified) */
export type TokenParams = {
  name: string;
  symbol: string;
  /** Token admin address (can update image/metadata). Defaults to address(0) (renounced) if omitted. */
  tokenAdmin?: `0x${string}`;
  image?: string;
  metadata?: string;
  context?: string;
};

/** Fee recipient configuration */
export type FeeRecipient = {
  address: `0x${string}`;
  /** BPS share out of 10,000 (sum of all recipients must == 10,000) */
  bps: number;
};

/** Extension type identifiers */
export type ExtensionType = 'creatorBuy' | 'vestingVault' | 'airdropDistributor';

/** Pool price information */
export type PoolPrice = {
  /** Token address */
  token: `0x${string}`;
  /** Pool address */
  pool: `0x${string}`;
  /** Current tick */
  tick: number;
  /** sqrtPriceX96 */
  sqrtPriceX96: bigint;
  /** Active liquidity */
  liquidity: bigint;
  /** Price: how many tokens per 1 BNB */
  tokensPerBNB: number;
  /** Price: how many BNB per 1 token */
  bnbPerToken: number;
  /** Whether the base token is token0 in the pool */
  tokenIsToken0: boolean;
};

/** Deployment result after tx confirmed */
export type DeployResult = {
  /** Transaction hash */
  txHash: `0x${string}`;
  /** Deployed token address */
  tokenAddress: `0x${string}`;
  /** Pool address */
  poolAddress: `0x${string}`;
  /** LP NFT token ID */
  nftTokenId: bigint;
};

/** Fee claim result */
export type ClaimResult = {
  txHash: `0x${string}`;
};

/** Swap result */
export type SwapResult = {
  txHash: `0x${string}`;
  amountIn: bigint;
  /** Minimum guaranteed output (slippage-adjusted). Actual output may be higher. */
  amountOutMinimum: bigint;
};
