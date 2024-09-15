
// import { aN, bo } from '@raydium-io/raydium-sdk-v2/lib/api-33b5ab27';
import { N } from '@raydium-io/raydium-sdk-v2/lib/api-8d4cc174';
import { PublicKey } from '@solana/web3.js';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import dotenv from "dotenv";
dotenv.config();

// DB MODELS
export type PORTFOLIO_TYPE = {
  chatId: number,
  wallets: Array<{
    walletId: String,
    publicKey: PublicKey | String,
    secretKey: PublicKey | String
  }>
  positions: Array<any>,
  activeWalletIndex: number
}

export const DefaultPortfolioData: PORTFOLIO_TYPE = {
  chatId: 0,
  wallets: [{
    walletId: new String(),
    publicKey: DEFAULT_PUBLIC_KEY,
    secretKey: DEFAULT_PUBLIC_KEY
  }],
  positions: [
  ],
  activeWalletIndex: 0

}

export interface ISESSION_DATA {
  AmmPoolKeys: any;
  AmmRpcData: any;
  AmmPoolInfo: any;
  pnlcard: boolean;
  userProfit : number ;
  expectedAmountOut_order: number;
  CpmmSolExtracted: number;
  cpmm_amountIn: number;
  cpmm_side: string;
  cpmmPoolId: any;
  cpmmPoolInfo: any;
  chatId: number;
  portfolio: PORTFOLIO_TYPE,
  activeTradingPool: any;
  latestCommand: string;
  previousCommand: string;
  currentMode: string;
  latestSlippage: number
  metadataMessageId: number;
  snipeToken: PublicKey;
  cpmmSnipeToken :PublicKey;
  isCpmmPool: boolean;
  pumpToken: PublicKey;
  latestToken: PublicKey;
  snipeAmount: number;
  snipeSlippage: number;
  snipeStatus: boolean;
  snipperLookup: boolean;
  rugCheckToken: PublicKey;
  rugCheckPool: any;
  recipientAddress: PublicKey;
  solAmount: number;
  awaitingWalletAddress: boolean;
  autoBuyActive: boolean;
  autoBuy_token: string;
  mevActive: boolean;
  autobuy_amount: number;
  generatorWallet: PublicKey;
  referralCommision: number;
  poolTime: number;
  positionPool: Array<any>;
  swaptypeDex: string;
  ispriorityCustomFee: boolean;
  customPriorityFee: number;
  positionIndex: number;
  allowedReferral:String, // tg Username
  pump_amountIn: number,
  pump_side: string,
  pump_amountOut: number,
  txPriorityFee: number,
  jupSwap_token: string,
  jupSwap_side: string,
  jupSwap_amount: number,
  jupSwap:{token:String,side:String,amount:number},
  ammAddress: string,
  limitOrders_token: PublicKey,
  limitOrders_side: string,
  limitOrders_amount: number,
  limitOrders_price: number,
  limitOrders_time: number,
  orderPercentPrice: boolean,
  MEV_protection: boolean,
  key_buy_option_1: Number,
  key_buy_option_2: Number,
  poolSchedule: {
    status: String,
    baseDecimals: Number,
    quoteDecimals: Number,
    lpDecimals: Number,
    baseReserve: String,
    quoteReserve: String,
    lpSupply: String,
    startTime: String
  },
  positionToken: string,
  activeTradingPoolId: string
}

export const enum PriotitizationFeeLevels {
  LOW = 5000,
  MEDIUM = 7500,
  HIGH = 10000,
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
  chatId: 0,
  portfolio: {
    chatId: 0,
    wallets: [],
    positions: [],
    activeWalletIndex: 0
  },
  key_buy_option_1: 0.5,
  key_buy_option_2: 1,
  MEV_protection: false,
  AmmPoolKeys: {},
  AmmRpcData: {},
  AmmPoolInfo: {},
  activeTradingPoolId: '',
  positionToken: '',
  pnlcard: false,
  userProfit: 0,
  autoBuyActive: false,
  autoBuy_token: '',
  mevActive: false,
  autobuy_amount: 0.01,
  expectedAmountOut_order: 0,
  CpmmSolExtracted: 0,
  cpmm_amountIn: 0,
  cpmm_side: '',
  cpmmPoolId: {},
  cpmmPoolInfo: {},
  swaptypeDex: '',
  ammAddress: '',
  pump_side: '',
  pump_amountIn: 0,
  pump_amountOut: 0,
  jupSwap_amount: 0,
  jupSwap_side: '',
  referralCommision: 3500,
  txPriorityFee: 100000,
  customPriorityFee: 0.0001,
  ispriorityCustomFee: false,
  awaitingWalletAddress: false,
  generatorWallet: DEFAULT_PUBLIC_KEY,
  rugCheckToken: DEFAULT_PUBLIC_KEY,
  rugCheckPool: undefined,
  pumpToken: DEFAULT_PUBLIC_KEY,
  solAmount: 0,
  recipientAddress: DEFAULT_PUBLIC_KEY,
  activeTradingPool: undefined,
  latestCommand: '',
  previousCommand: '',
  currentMode: '',
  latestSlippage: 5,
  metadataMessageId: 0,
  snipeToken: DEFAULT_PUBLIC_KEY,
  cpmmSnipeToken: DEFAULT_PUBLIC_KEY,
  isCpmmPool: false,
  latestToken: DEFAULT_PUBLIC_KEY,
  snipeStatus: true,
  snipperLookup: false,
  snipeAmount: 0,
  snipeSlippage: 80,
  poolTime: 0,
  positionPool: [],
  // priorityFees: PriotitizationFeeLevels.LOW,
  positionIndex: 0,
  allowedReferral:'', // tg Username
  limitOrders_token: DEFAULT_PUBLIC_KEY,
  limitOrders_side: '',
  limitOrders_amount: 0,
  limitOrders_price: 0,
  limitOrders_time: 0,
  orderPercentPrice: false,
  jupSwap_token: '',
  jupSwap:{token:'',side:'',amount:0},
  poolSchedule: {
    status: '',
    baseDecimals: 0,
    quoteDecimals: 0,
    lpDecimals: 0,
    baseReserve: '',
    quoteReserve: '',
    lpSupply: '',
    startTime: ''
  },
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
  positionChatId: number;
  walletId: string;
  positions: [
    {
      baseMint: string;
      name: string;
      symbol: string;
      tradeType: string;
      amountIn: number;
      amountOut: number | undefined;
    }
  ]
}