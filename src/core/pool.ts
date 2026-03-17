/**
 * Octopurr Pool Information
 *
 * Read pool state: price, tick, liquidity, market cap.
 * Supports BSC Mainnet (56) and BSC Testnet (97).
 */

import { type PublicClient, getAddress } from 'viem';
import { PancakeV3Factory_abi, PancakeV3Pool_abi, ERC20_abi } from '../abi/PancakeV3.js';
import { getChainConfig, type SupportedChainId, POOL_CONFIG } from '../config/index.js';
import type { PoolPrice } from '../utils/types.js';

/**
 * Get the pool address for a token paired with WBNB.
 */
export async function getPoolAddress(
  token: `0x${string}`,
  publicClient: PublicClient,
  chainIdOrTestnet: SupportedChainId | boolean = 56,
): Promise<`0x${string}` | null> {
  const chainId = typeof chainIdOrTestnet === 'boolean' ? (chainIdOrTestnet ? 97 : 56) : chainIdOrTestnet;
  const cfg = getChainConfig(chainId);

  const pool = await publicClient.readContract({
    address: cfg.pancake.factory,
    abi: PancakeV3Factory_abi,
    functionName: 'getPool',
    args: [token, cfg.wbnb, POOL_CONFIG.feeTier],
  });

  if (pool === '0x0000000000000000000000000000000000000000') {
    return null;
  }

  return pool;
}

/**
 * Get pool price information for an Octopurr token.
 *
 * NOTE: Price values (tokensPerBNB, bnbPerToken) use JavaScript Number (float64).
 * This is approximate — suitable for display/UI but NOT for precise accounting.
 * For exact calculations, use sqrtPriceX96 with bigint arithmetic.
 */
export async function getPoolPrice(
  token: `0x${string}`,
  publicClient: PublicClient,
  chainIdOrTestnet: SupportedChainId | boolean = 56,
): Promise<PoolPrice | null> {
  const chainId = typeof chainIdOrTestnet === 'boolean' ? (chainIdOrTestnet ? 97 : 56) : chainIdOrTestnet;
  const pool = await getPoolAddress(token, publicClient, chainId);
  if (!pool) return null;

  const [slot0, liquidity, token0] = await Promise.all([
    publicClient.readContract({
      address: pool,
      abi: PancakeV3Pool_abi,
      functionName: 'slot0',
    }),
    publicClient.readContract({
      address: pool,
      abi: PancakeV3Pool_abi,
      functionName: 'liquidity',
    }),
    publicClient.readContract({
      address: pool,
      abi: PancakeV3Pool_abi,
      functionName: 'token0',
    }),
  ]);

  const [sqrtPriceX96, tick] = slot0;
  const tokenIsToken0 = getAddress(token).toLowerCase() === getAddress(token0).toLowerCase();

  const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96;
  const priceToken1InToken0 = sqrtPrice * sqrtPrice;

  let tokensPerBNB: number;
  let bnbPerToken: number;

  if (tokenIsToken0) {
    bnbPerToken = priceToken1InToken0;
    tokensPerBNB = bnbPerToken > 0 ? 1 / bnbPerToken : 0;
  } else {
    tokensPerBNB = priceToken1InToken0;
    bnbPerToken = tokensPerBNB > 0 ? 1 / tokensPerBNB : 0;
  }

  return {
    token: getAddress(token) as `0x${string}`,
    pool,
    tick: Number(tick),
    sqrtPriceX96: BigInt(sqrtPriceX96),
    liquidity: BigInt(liquidity),
    tokensPerBNB,
    bnbPerToken,
    tokenIsToken0,
  };
}

/**
 * Get the current market cap of a token in BNB.
 */
export async function getMarketCapBNB(
  token: `0x${string}`,
  publicClient: PublicClient,
  chainIdOrTestnet: SupportedChainId | boolean = 56,
): Promise<number | null> {
  const chainId = typeof chainIdOrTestnet === 'boolean' ? (chainIdOrTestnet ? 97 : 56) : chainIdOrTestnet;
  const price = await getPoolPrice(token, publicClient, chainId);
  if (!price) return null;

  const totalSupply = await publicClient.readContract({
    address: token,
    abi: ERC20_abi,
    functionName: 'totalSupply',
  });

  const supplyNum = Number(totalSupply) / 1e18;
  return price.bnbPerToken * supplyNum;
}

/**
 * Get the current market cap of a token in USD.
 */
export async function getMarketCapUSD(
  token: `0x${string}`,
  bnbPriceUSD: number,
  publicClient: PublicClient,
  chainIdOrTestnet: SupportedChainId | boolean = 56,
): Promise<number | null> {
  const chainId = typeof chainIdOrTestnet === 'boolean' ? (chainIdOrTestnet ? 97 : 56) : chainIdOrTestnet;
  const mcapBNB = await getMarketCapBNB(token, publicClient, chainId);
  if (mcapBNB === null) return null;
  return mcapBNB * bnbPriceUSD;
}
