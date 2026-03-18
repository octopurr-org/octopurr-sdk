# @octopurr/sdk

TypeScript SDK for [Octopurr](https://octopurr.com) — Token & Agent Launchpad on BNB Chain.

Deploy tokens, deploy agentbound tokens (ERC-8004), trade, and claim fees — all on-chain via PancakeSwap.

## Install

```bash
npm install @octopurr/sdk viem
```

## AI Agents

**Read the skill file for complete implementation guide:**

📄 **[octopurr.com/skill.md](https://octopurr.com/skill.md)**

The skill file contains all parameters, required steps (deploy → register → set wallet), code examples, and claim flows. Use it as the primary reference.

## Quick Start

```typescript
import { createPublicClient, createWalletClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { core } from '@octopurr/sdk';

const account = privateKeyToAccount('0x...');
const publicClient = createPublicClient({ chain: bsc, transport: http() });
const walletClient = createWalletClient({ chain: bsc, transport: http(), account });

// Deploy a token (Step 1 of 2 — must also register with API)
const result = await core.deployToken({
  token: { name: 'MyToken', symbol: 'MTK' },
  marketCapBNB: 30,
  recipients: [{ address: account.address, bps: 10_000 }],
  chainId: 56,
}, publicClient, walletClient);
```

## API Reference

| Function | Description |
|----------|-------------|
| `core.deployToken(params, pub, wallet)` | Deploy BEP-20 + PancakeSwap pool |
| `core.registerToken(apiUrl, data)` | Register deployed token with API **(required)** |
| `deployAgentboundToken(params, pub, wallet, chainId)` | Atomic agent + token deploy (ERC-8004) |
| `registerAgentWithToken(apiUrl, params)` | Register agent + token with API **(required)** |
| `buildSetAgentWalletTypedData(agentId, wallet, owner, deadline, chainId)` | Build EIP-712 typed data for setAgentWallet |
| `setAgentWallet(agentId, wallet, deadline, sig, pub, wallet, chainId)` | Set agent wallet **(required for fees)** |
| `core.buyToken(params, pub, wallet)` | Buy tokens with BNB |
| `core.sellToken(params, pub, wallet)` | Sell tokens for BNB (auto Permit2) |
| `core.claimFees(tokenId, pub, wallet)` | Collect LP fees |
| `claimAgentFees(agentId, tokenId, pub, wallet)` | Claim agent fee share → agentWallet |
| `core.buildCreatorBuyExtension(bnb, params, chainId)` | Build CreatorBuy extension |
| `core.buildVestingVaultExtension(bps, params, chainId)` | Build VestingVault extension |
| `core.buildAirdropExtension(bps, params, chainId)` | Build Airdrop extension |
| `getAgentInfo(agentId, pub, chainId)` | Query agent on-chain |
| `getAgentFeeState(agentId, tokenId, pub, chainId)` | Query agent fee state |
| `core.getPoolPrice(token, pub, chainId)` | Get pool price |
| `core.getMarketCapBNB(token, pub, chainId)` | Get market cap in BNB |
| `config.getChainConfig(chainId)` | Chain addresses and constants |

## Chains

| Network | Chain ID |
|---------|----------|
| BNB Chain Mainnet | 56 |
| BNB Chain Testnet | 97 |

## Links

- 📄 **[Skill File](https://octopurr.com/skill.md)** — complete guide for AI agents
- 📚 [Docs](https://github.com/octopurr-org/octopurr-docs)
- 🌐 [Website](https://octopurr.com)

## License

MIT
