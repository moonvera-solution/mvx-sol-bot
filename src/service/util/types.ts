import { PublicKey } from '@solana/web3.js';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');

// DB MODELS
export type PORTFOLIO_TYPE = {
  chatId: number,
  wallets: Array<{
    walletId: String,
    publicKey: PublicKey | String,
    secretKey: PublicKey | String
  }>
  positions: Array<any>
}

export const DefaultPortfolioData: PORTFOLIO_TYPE = {
  chatId: 0,
  wallets: [{
    walletId: new String(),
    publicKey: DEFAULT_PUBLIC_KEY,
    secretKey: DEFAULT_PUBLIC_KEY
  }],
  positions: [
    
  ]
}

export interface ISESSION_DATA {
  portfolio: PORTFOLIO_TYPE,
  activeWalletIndex: number | 0,
  activeTradingPool: RAYDIUM_POOL_TYPE;
  tokenRayPoolInfo: Record<string, RAYDIUM_POOL_TYPE>;
  latestCommand: string;
  currentMode: string;
  latestSlippage: number
  metadataMessageId: number;
  buyToken: PublicKey; // New field to store metadata message ID
  sellToken: PublicKey; // New field to store metadata message ID
  snipeToken: PublicKey;
  snipeAmount: number;
  snipeSlippage: number;
  buyTokenHistory: PublicKey[];
  sellTokenHistory: PublicKey[];
  tokenHistory: PublicKey[];
  rugCheckToken: PublicKey;
  recipientAddress: PublicKey;
  solAmount: number;
  awaitingWalletAddress: boolean;
  generatorWallet: PublicKey;
  referralCommision: number;
  
}

export const DefaultPoolInfoData: RAYDIUM_POOL_TYPE = {
  "id": DEFAULT_PUBLIC_KEY,
  "baseMint": DEFAULT_PUBLIC_KEY,
  "quoteMint": DEFAULT_PUBLIC_KEY,
  "lpMint": DEFAULT_PUBLIC_KEY,
  "baseDecimals": 0,
  "quoteDecimals": 0,
  "lpDecimals": 0,
  "version": 0,
  "marketVersion": 0,
  "programId": DEFAULT_PUBLIC_KEY,
  "authority": DEFAULT_PUBLIC_KEY,
  "openOrders": DEFAULT_PUBLIC_KEY,
  "targetOrders": DEFAULT_PUBLIC_KEY,
  "baseVault": DEFAULT_PUBLIC_KEY,
  "quoteVault": DEFAULT_PUBLIC_KEY,
  "withdrawQueue": DEFAULT_PUBLIC_KEY,
  "lpVault": DEFAULT_PUBLIC_KEY,
  "marketProgramId": DEFAULT_PUBLIC_KEY,
  "marketId": DEFAULT_PUBLIC_KEY,
  "marketAuthority": DEFAULT_PUBLIC_KEY,
  "marketBaseVault": DEFAULT_PUBLIC_KEY,
  "marketQuoteVault": DEFAULT_PUBLIC_KEY,
  "marketBids": DEFAULT_PUBLIC_KEY,
  "marketAsks": DEFAULT_PUBLIC_KEY,
  "marketEventQueue": DEFAULT_PUBLIC_KEY,
  "lookupTableAccount": DEFAULT_PUBLIC_KEY
}

export const DefaultSessionData: ISESSION_DATA = {
  portfolio: {
    chatId: 0,
    wallets: [],
    positions: []
  },
  referralCommision: 0,
  awaitingWalletAddress: false,
  generatorWallet: DEFAULT_PUBLIC_KEY,
  rugCheckToken: DEFAULT_PUBLIC_KEY,
  solAmount: 0,
  recipientAddress: DEFAULT_PUBLIC_KEY,
  tokenHistory: [],
  tokenRayPoolInfo: {},
  buyTokenHistory: [],
  sellTokenHistory: [],
  activeWalletIndex: 0,
  activeTradingPool: DefaultPoolInfoData,
  latestCommand: '',
  currentMode: '',
  latestSlippage: 5,
  metadataMessageId: 0,
  buyToken: DEFAULT_PUBLIC_KEY,
  sellToken: DEFAULT_PUBLIC_KEY,
  snipeToken: DEFAULT_PUBLIC_KEY,
  snipeAmount: 0,
  snipeSlippage: 20,
  // txTip:5_000
}

export type RAYDIUM_POOL_TYPE = {
  "id": PublicKey;
  "baseMint": PublicKey;
  "quoteMint": PublicKey;
  "lpMint": PublicKey;
  "baseDecimals": number,
  "quoteDecimals": number,
  "lpDecimals": number,
  "version": number,
  "programId": PublicKey;
  "authority": PublicKey;
  "openOrders": PublicKey;
  "targetOrders": PublicKey;
  "baseVault": PublicKey;
  "quoteVault": PublicKey;
  "withdrawQueue": PublicKey;
  "lpVault": PublicKey;
  "marketVersion": number,
  "marketProgramId": PublicKey;
  "marketId": PublicKey;
  "marketAuthority": PublicKey;
  "marketBaseVault": PublicKey;
  "marketQuoteVault": PublicKey;
  "marketBids": PublicKey;
  "marketAsks": PublicKey;
  "marketEventQueue": PublicKey;
  "lookupTableAccount": PublicKey;
}
export type REFERRAL_TYPE = {
  generatorChatId: number;
  generatorWallet: string;    // Wallet of the referrer
  referralCode: string;        
  earnings: number;            // Earnings from the referral
  createdAt?: Date;            // Date when the referral was made
  numberOfReferrals?: number;  // Number of users referred by the referrer
  commissionPercentage: number; // Commission percentage for the referral
  referredUsers: number[];     // List of users referred by the referrer
};

export type USERPOSITION_TYPE = {
  walletId: string;
  positions:[
    {
      baseMint: string;
      symbol: string;
      tradeType: string;
      amountIn: number;
      amountOut: number | undefined;    }
  ]
}