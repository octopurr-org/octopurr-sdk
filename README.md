# @octopurr/sdk

TypeScript SDK for [Octopurr](https://octopurr.com) — Token Launchpad with Fee Accumulation on BNB Chain.

Deploy tokens, deploy agentbound tokens (ERC-8004), trade, and claim fees — all on-chain via PancakeSwap V3.

## Install

```bash
npm install @octopurr/sdk viem
```

## Quick Start

```typescript
import { createPublicClient, createWalletClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { core } from '@octopurr/sdk';

const account = privateKeyToAccount('0x...');
const publicClient = createPublicClient({ chain: bsc, transport: http() });
const walletClient = createWalletClient({ chain: bsc, transport: http(), account });

// Deploy a token
const result = await core.deployToken({
  token: { name: 'MyToken', symbol: 'MTK' },
  marketCapBNB: 30,
  recipients: [{ address: account.address, bps: 10_000 }],
  chainId: 56,
}, publicClient, walletClient);

if (result.error) {
  console.error(result.error.label);
} else {
  console.log('Token:', result.tokenAddress);
}
```

## Deploy Agentbound Token

```typescript
import { deployAgentboundToken } from '@octopurr/sdk';

const result = await deployAgentboundToken({
  agent: { name: 'My Agent', description: 'An autonomous agent' },
  token: {
    token: { name: 'AgentCoin', symbol: 'ACOIN' },
    marketCapBNB: 30,
    recipients: [],
  },
  agentBps: 10_000,
  nftRecipient: account.address,
}, publicClient, walletClient, 56);
```

## Buy & Sell

```typescript
import { parseEther } from 'viem';

// Buy
await core.buyToken({
  token: '0x...' as `0x${string}`,
  amountIn: parseEther('0.1'),
  chainId: 56,
}, publicClient, walletClient);

// Sell (Permit2 handled automatically)
await core.sellToken({
  token: '0x...' as `0x${string}`,
  amountIn: parseUnits('10000', 18),
  chainId: 56,
}, publicClient, walletClient);
```

## API Reference

| Function | Description |
|----------|-------------|
| `core.deployToken(params, pub, wallet)` | Deploy BEP-20 + PancakeSwap V3 pool |
| `deployAgentboundToken(params, pub, wallet, chainId)` | Atomic agent + token deploy (ERC-8004) |
| `core.buyToken(params, pub, wallet)` | Buy tokens with BNB |
| `core.sellToken(params, pub, wallet)` | Sell tokens for BNB (auto Permit2) |
| `core.claimFees(tokenId, pub, wallet)` | Collect LP fees (permissionless) |
| `claimAgentFees(agentId, tokenId, pub, wallet)` | Claim agent fee share |
| `claimSocialFees(platform, id, tokenId, pub, wallet)` | Claim social identity fee share |
| `computeSocialIdentityHash(platform, id)` | Compute social identity hash |
| `computeErc8004IdentityHash(agentId)` | Compute agent identity hash |
| `core.buildCreatorBuyExtension(bnb, params, chainId)` | Build CreatorBuy extension config |
| `core.buildVestingVaultExtension(bps, params, chainId)` | Build VestingVault extension config |
| `getAgentInfo(agentId, pub, chainId)` | Query agent metadata on-chain |
| `getAgentFeeState(agentId, tokenId, pub, chainId)` | Query agent fee state |
| `config.getChainConfig(chainId)` | Chain addresses and constants |

## Chains

| Network | Chain ID |
|---------|----------|
| BNB Chain Mainnet | 56 |
| BNB Chain Testnet | 97 |

## Documentation

- **Full SDK docs:** [docs.octopurr.com](https://docs.octopurr.com)
- **Agent skill file:** [octopurr.com/skill.md](https://octopurr.com/skill.md)
- **Website:** [octopurr.com](https://octopurr.com)

## License

MIT
