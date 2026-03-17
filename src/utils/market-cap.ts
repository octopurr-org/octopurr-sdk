import { POOL_CONFIG } from '../config/index.js';

/** Uniswap/PancakeSwap V3 tick bounds */
const MIN_TICK = -887272;
const MAX_TICK = 887272;

/**
 * Calculate starting tick from target market cap in BNB.
 *
 * Formula:
 *   price_per_token = marketCapBNB / totalSupply
 *   tick = floor(log(price) / log(1.0001) / tickSpacing) * tickSpacing
 *
 * @param marketCapBNB - Target market cap in BNB (e.g., 30 for 30 BNB)
 * @returns tickIfToken0IsBase (aligned to tickSpacing=200)
 */
export function marketCapToTick(marketCapBNB: number): number {
  if (marketCapBNB <= 0) throw new Error('Market cap must be positive');

  const desiredPrice = marketCapBNB / POOL_CONFIG.totalSupplyNumber;
  const rawTick = Math.log(desiredPrice) / Math.log(1.0001);
  return Math.floor(rawTick / POOL_CONFIG.tickSpacing) * POOL_CONFIG.tickSpacing;
}

/**
 * Calculate market cap in BNB from a tick value.
 *
 * @param tick - Pool tick value
 * @returns Market cap in BNB
 */
export function tickToMarketCap(tick: number): number {
  const price = Math.pow(1.0001, tick);
  return price * POOL_CONFIG.totalSupplyNumber;
}

/**
 * Calculate starting tick from target market cap in USD.
 *
 * @param marketCapUSD - Target market cap in USD
 * @param bnbPriceUSD - Current BNB price in USD
 * @returns tickIfToken0IsBase
 */
export function marketCapUSDToTick(marketCapUSD: number, bnbPriceUSD: number): number {
  if (bnbPriceUSD <= 0) throw new Error('BNB price must be positive');
  return marketCapToTick(marketCapUSD / bnbPriceUSD);
}

/**
 * Calculate market cap in USD from a tick value.
 *
 * @param tick - Pool tick value
 * @param bnbPriceUSD - Current BNB price in USD
 * @returns Market cap in USD
 */
export function tickToMarketCapUSD(tick: number, bnbPriceUSD: number): number {
  return tickToMarketCap(tick) * bnbPriceUSD;
}

/**
 * Calculate default LP position tick range for a given starting tick.
 * Standard: single position from startingTick to a wide upper bound.
 *
 * @param startingTick - The starting tick (market cap tick)
 * @param growthMultiple - Max growth multiple (default: 100,000x)
 * @returns { tickLower, tickUpper } aligned to tickSpacing
 */
export function getDefaultTickRange(
  startingTick: number,
  growthMultiple: number = 100_000,
): { tickLower: number; tickUpper: number } {
  const { tickSpacing } = POOL_CONFIG;

  // tickLower = startingTick (LP starts at current price)
  // But LP position tickLower must be > startingTick for single-sided liquidity
  // In PancakeSwap V3 convention with base token as token0:
  // startingTick is negative, tickLower < tickUpper, both negative
  // tickLower should be slightly above startingTick
  const tickLower = startingTick + tickSpacing;

  // tickUpper = startingTick + log(growthMultiple) / log(1.0001), clamped to MAX_TICK
  const growthTicks = Math.log(growthMultiple) / Math.log(1.0001);
  const rawTickUpper = startingTick + growthTicks;
  const alignedTickUpper = Math.floor(rawTickUpper / tickSpacing) * tickSpacing;
  const maxAlignedTick = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;
  const tickUpper = Math.min(alignedTickUpper, maxAlignedTick);

  if (tickLower >= tickUpper) {
    throw new Error(`Cannot compute valid tick range: tickLower (${tickLower}) >= tickUpper (${tickUpper})`);
  }

  return { tickLower, tickUpper };
}
