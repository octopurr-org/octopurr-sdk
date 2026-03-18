/**
 * Protocol contract addresses.
 * Updated via sync-addresses.js after each deploy.
 * Source of truth: github.com/octopurr-org/octopurr-addresses
 *
 * IMPORTANT: Each chain entry MUST include wbnb + pancake nested fields
 * in addition to octopurr protocol addresses — required by loadChainConfig().
 */

export const CHAIN_ADDRESSES = {
  56: {
    // ── Octopurr Protocol — deployed 2026-03-15 (v12) ──
    tokenFactory:         '0x43e19104552685c88829cFB115538287A2C0F570' as `0x${string}`,
    lpLocker:             '0x8e46f91eDCDa15201a7427cCAEF97720942587e6' as `0x${string}`,
    protocolFeeCollector: '0x57860fa6D31b6497C4739E04c28Cce9F35d8b598' as `0x${string}`,
    // ── Identity Resolver architecture — deployed 2026-03-15 (v12) ──
    identityResolver:     '0x7C4DF8e2F127dA8C624257Cf8aB8B06a9989A062' as `0x${string}`,
    socialResolver:       '0x365F736dD0EB3efBb2e916338F6E6e025990A216' as `0x${string}`,
    agentResolver:        '0xbCAbb6873B6B6EA6B77b6224Eb19b66D15c43145' as `0x${string}`,
    vestingVault:         '0xec4F26CDd5A6C17f8E3046154aD10cCb97C7C02F' as `0x${string}`,
    airdropDistributor:   '0xdc7ec4EdDBb16388c86d23F836869f7a5c757252' as `0x${string}`,
    creatorBuy:           '0x95dA8554971005f972Bc843C5a8Aa98431895fc5' as `0x${string}`,
    agentDeployer:        '0x7D6E20E66002875883AD3B332168087E77b8073d' as `0x${string}`,
    // ── BSC Mainnet constants ──
    wbnb:                 '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as `0x${string}`,
    pancake: {
      factory:        '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865' as `0x${string}`,
      positionManager:'0x46A15B0b27311cedF172AB29E4f4766fbE7F4364' as `0x${string}`,
      swapRouter:     '0x1b81D678ffb9C0263b24A97847620C99d213eB14' as `0x${string}`,
      quoterV2:       '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997' as `0x${string}`,
      universalRouter:'0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB' as `0x${string}`,
      permit2:        '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768' as `0x${string}`,
    },
  },
  97: {
    // ── Octopurr Protocol — redeployed 2026-03-14 (v9: fix CreatorBuy swapRouter) ──
    tokenFactory:         '0xec4F26CDd5A6C17f8E3046154aD10cCb97C7C02F' as `0x${string}`,
    lpLocker:             '0x43e19104552685c88829cFB115538287A2C0F570' as `0x${string}`,
    protocolFeeCollector: '0x8e46f91eDCDa15201a7427cCAEF97720942587e6' as `0x${string}`,
    identityResolver:     '0x7C4DF8e2F127dA8C624257Cf8aB8B06a9989A062' as `0x${string}`,
    socialResolver:       '0x365F736dD0EB3efBb2e916338F6E6e025990A216' as `0x${string}`,
    agentResolver:        '0xbCAbb6873B6B6EA6B77b6224Eb19b66D15c43145' as `0x${string}`,
    vestingVault:         '0xdc7ec4EdDBb16388c86d23F836869f7a5c757252' as `0x${string}`,
    airdropDistributor:   '0x95dA8554971005f972Bc843C5a8Aa98431895fc5' as `0x${string}`,
    creatorBuy:           '0x7D6E20E66002875883AD3B332168087E77b8073d' as `0x${string}`,
    agentDeployer:        '0xA2daE41abb0f84D17c132559Ef82836D9d07DFD2' as `0x${string}`,
    // ── BSC Testnet constants ──
    wbnb:                 '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd' as `0x${string}`,
    pancake: {
      factory:        '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865' as `0x${string}`,
      positionManager:'0x427bF5b37357632377eCbEC9de3626C71A5396c1' as `0x${string}`,
      swapRouter:     '0x1b81D678ffb9C0263b24A97847620C99d213eB14' as `0x${string}`,
      quoterV2:       '0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2' as `0x${string}`,
      universalRouter:'0x87FD5305E6a40F378da124864B2D479c2028BD86' as `0x${string}`,
      permit2:        '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768' as `0x${string}`,
    },
  },
} as const;
