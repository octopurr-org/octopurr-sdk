import {
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  TimeoutError,
  HttpRequestError,
  RpcRequestError,
  UserRejectedRequestError,
} from 'viem';
import { OctopurrError } from './types.js';

/** Known contract error labels */
const ERROR_LABELS: Record<string, string> = {
  // TokenFactory
  Deprecated: 'Factory is deprecated',
  InvalidFee: 'Invalid fee tier',
  InvalidFeeTier: 'Invalid fee tier',
  InvalidTickRange: 'Invalid tick range',
  InvalidPairedToken: 'Invalid paired token (must be WBNB)',
  ExtensionNotEnabled: 'Extension is not enabled',
  MaxExtensionsExceeded: 'Too many extensions',
  MaxExtensionBpsExceeded: 'Extension BPS exceeds maximum (90%)',
  PoolCreationFailed: 'Pool creation failed',
  PoolAlreadyInitialized: 'Pool already initialized (try a different salt)',
  SupplyAccountingError: 'Extension supply accounting mismatch',
  MsgValueMismatch: 'BNB value does not match extension requirements',

  // LPLocker
  NotFactory: 'Caller is not the factory',
  PositionNotLocked: 'Position is not locked',
  AlreadyLocked: 'Position already locked',
  InvalidConfig: 'Invalid fee config (check recipients/BPS)',
  NotRecipient: 'Only the current recipient can update',
  ZeroAddress: 'Address cannot be zero',
  WalletNotBound: 'Wallet not bound in SocialResolver',
  SenderNotAuthorized: 'Caller is not the bound wallet',
  NoBalance: 'No pending balance to withdraw',
  NeverAccrued: 'No fees have been accrued',
  NotExpired: 'Balance has not expired yet (3 years = 1095 days)',

  // CreatorBuy
  NoSupplyAllowed: 'CreatorBuy must have 0 BPS allocation',
  NoBNBSent: 'Must send BNB for creator buy',
  ValueMismatch: 'BNB value mismatch',
  ZeroRecipient: 'Recipient cannot be zero address',
  InsufficientOutput: 'Swap output below minimum (slippage)',
  OnlyFactory: 'Only factory can call',

  // VestingVault
  InvalidVaultBps: 'Vesting vault BPS must be > 0',
  InvalidVaultAdmin: 'Vesting vault admin cannot be zero',
  AllocationAlreadyExists: 'Vesting allocation already exists for this token',
  AllocationNotUnlocked: 'Vesting lockup has not ended',
  NoBalanceToClaim: 'No vested tokens available to claim',

  // AirdropDistributor
  InvalidMerkleRoot: 'Merkle root cannot be zero',
  InvalidAdmin: 'Admin address cannot be zero',
  AirdropAlreadyExists: 'Airdrop already exists for this token',
  AlreadyClaimed: 'Airdrop already claimed',
  InvalidProof: 'Invalid merkle proof',
  InsufficientBalance: 'Insufficient airdrop balance',
  AirdropNotExpired: 'Airdrop claim window has not expired',

  // SocialResolver
  AlreadyBound: 'Identity already bound to a wallet',
  SameWallet: 'New wallet is the same as current',
  PendingWalletChangeExists: 'A wallet change is already pending',
  NoPendingWalletChange: 'No pending wallet change',
  WalletChangeNotReady: 'Wallet change timelock not elapsed',
  AttestationExpired: 'Attestation has expired',
  InvalidDeadline: 'Deadline too far in the future (max 30 min)',
  NonceUsed: 'Nonce already used',
  InvalidAttestation: 'Invalid attestor signature',
  InvalidWalletSig: 'Invalid wallet signature',
  BindingIsFrozen: 'Binding is frozen (under investigation)',
  GlobalEmergencyActive: 'Global emergency pause is active',

  // AgentDeployer
  InsufficientFee: 'Insufficient registration fee',
  FeeTransferFailed: 'Fee transfer to collector failed',
  InvalidAgentBps: 'Agent BPS must be between 1 and 10000',
  InvalidTotalBps: 'Total BPS (recipients + delegates + agent) must equal 10000',
  ArrayLengthMismatch: 'Delegate recipients and BPS arrays must have the same length',
  UnauthorizedNFT: 'Only IdentityRegistry NFTs are accepted',
  FeeTooHigh: 'Registration fee exceeds maximum (0.01 BNB)',

  // AgentResolver
  IsPaused: 'Agent resolver is currently paused',
  HashMismatch: 'Identity hash mismatch',
  AgentWalletNotSet: 'Agent wallet not set — owner must call setAgentWallet() first',
  Erc8004RegistryCallFailed: 'ERC-8004 registry call failed',

  // AgentDeployer
  DuplicateExtension: 'Extension already present in config',
  DuplicateIdentityHash: 'Duplicate identity hash in recipients',
  ExcessValue: 'Excess BNB sent (msg.value > required)',

  // VestingVault
  InvalidVaultConfig: 'Invalid vault config (agent mode requires admin=address(0), direct mode requires admin)',
  WrongClaimMode: 'Wrong claim mode (use claim() for direct, claimByIdentity() for agent)',
  ResolvedWalletInvalid: 'Identity resolver returned zero address',
  IdentityResolverNotSet: 'Identity resolver not configured on VestingVault',
  InvalidMsgValue: 'Extension does not accept BNB',
  NotAdmin: 'Caller is not the admin',
  NoPendingAdmin: 'No pending admin proposal',
  NotPendingAdmin: 'Caller is not the pending admin',
  PendingAdminExists: 'A pending admin proposal already exists',
  AdminProposalExpired: 'Admin proposal has expired',

  // Ownership (2-step)
  NoPendingOwnerProposal: 'No pending owner proposal',
  NotPendingOwner: 'Caller is not the pending owner',
  PendingOwnerProposalExists: 'A pending owner proposal already exists',

  // LPLocker / VestingVault governance
  SameIrAdmin: 'New IR admin is the same as current',
  NotIrAdmin: 'Caller is not the IR admin',
  NotPendingIrAdmin: 'Caller is not the pending IR admin',
  PendingIrAdminExists: 'A pending IR admin transfer already exists',
  NoPendingIrAdmin: 'No pending IR admin transfer',
  IdentityResolverChangeNotReady: 'Identity resolver change timelock not elapsed',
  NoPendingIdentityResolver: 'No pending identity resolver change',
  PendingIdentityResolverExists: 'A pending identity resolver change already exists',

  // General
  OwnableUnauthorizedAccount: 'Not authorized (not owner)',
  NotOwner: 'Not authorized (not owner)',
  Unauthorized: 'Not authorized',
};

/**
 * Parse a viem error into a structured OctopurrError.
 */
export function parseError(e: unknown): OctopurrError {
  if (e instanceof OctopurrError) return e;
  if (!(e instanceof Error)) return OctopurrError.unknown(new Error(String(e)));
  if (!(e instanceof BaseError)) return OctopurrError.unknown(e);

  // Check for user rejection (wallet popup dismissed)
  const userReject = e.walk((err) => err instanceof UserRejectedRequestError);
  if (userReject) return OctopurrError.revert('Transaction rejected by user', e);

  // Check for insufficient funds
  const fundsError = e.walk((err) => err instanceof InsufficientFundsError);
  if (fundsError) return OctopurrError.funds(e);

  // Check for contract revert
  const revertError = e.walk((err) => err instanceof ContractFunctionRevertedError);
  if (revertError instanceof ContractFunctionRevertedError) {
    const name = revertError.data?.errorName ?? '';
    const label = ERROR_LABELS[name] ?? `Contract reverted: ${name || 'unknown'}`;
    return OctopurrError.revert(label, e);
  }

  // Check for network/timeout errors
  const timeoutError = e.walk((err) => err instanceof TimeoutError);
  if (timeoutError) return new OctopurrError('network', 'Request timed out', e);

  const httpError = e.walk((err) => err instanceof HttpRequestError);
  if (httpError) return new OctopurrError('network', 'Network request failed', e);

  const rpcError = e.walk((err) => err instanceof RpcRequestError);
  if (rpcError) return new OctopurrError('network', `RPC error: ${(rpcError as RpcRequestError).shortMessage ?? 'unknown'}`, e);

  return OctopurrError.unknown(e);
}
