import mongoose from "mongoose";
import { PublicKey } from '@solana/web3.js';
import { PORTFOLIO_TYPE, ISESSION_DATA, RAYDIUM_POOL_TYPE, USERPOSITION_TYPE, REFERRAL_TYPE } from '../../service/util/types';


const Schema = mongoose.Schema;
const WalletSchema = new Schema({
  chatId: { type: Number, unique: true }, // not unique, will be overriden when reseting wallet
  publicKey: String,
  secretKey: String,
});

const UserPortfolioSchema = new Schema<PORTFOLIO_TYPE>({
  chatId: { type: Number, unique: true },
  wallets: [
    {
      walletId: { type: String, unique: true },
      publicKey: String,
      secretKey: String,
    },
  ],
  positions: [],
  activeWalletIndex: { type: Number, default: 0 },
});

const PoolInfoSchema = new Schema<RAYDIUM_POOL_TYPE>({
  id: { type: String, unique: true },
  baseMint: String,
  quoteMint: String,
  lpMint: String,
  baseDecimals: Number,
  quoteDecimals: Number,
  lpDecimals: Number,
  version: Number,
  programId: String,
  authority: String,
  openOrders: String,
  targetOrders: String,
  baseVault: String,
  quoteVault: String,
  withdrawQueue: String,
  lpVault: String,
  marketVersion: Number,
  marketProgramId: String,
  marketId: String,
  marketAuthority: String,
  marketBaseVault: String,
  marketQuoteVault: String,
  marketBids: String,
  marketAsks: String,
  marketEventQueue: String,
  lookupTableAccount: String,
});

const ReferralSchema = new Schema<REFERRAL_TYPE>({
  generatorChatId: { type: Number, required: true },
  generatorWallet: { type: String, required: true },
  referralCode: { type: String, required: true },
  earnings: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  numberOfReferrals: { type: Number, default: 0 },
  commissionPercentage: { type: Number, required: true, default: 0 },
  referredUsers: [{ type: Number }]

});
const UserPositionSchema = new Schema<USERPOSITION_TYPE>({
  // positionChatId: { type: Number, unique: true, required: false },
  walletId: { type: String, unique: true, required: true },
  positions: [
    {
      baseMint: { type: String, required: true },
      name: { type: String, required: true },
      symbol: { type: String, required: true },
      tradeType: { type: String, required: true },
      amountIn: { type: Number, required: true },
      amountOut: { type: Number, default: 0 },
    }
  ]
});

const AllowedReferralsSchema = new Schema({
  tgUserName: { type: String, required: true }
});

export const UserPositions = mongoose.model<USERPOSITION_TYPE>(
  "UserPositions",
  UserPositionSchema
);

export const Referrals = mongoose.model<REFERRAL_TYPE>(
  "Referrals",
  ReferralSchema
);

const UserSessions = new Schema({
  chatId: { type: Number, unique: true },
  portfolio: {
    type: {
      chatId: Number,
      wallets: [
        {
          walletId: String,
          publicKey: String,
          secretKey: String
        }
      ],
      activeWalletIndex: { type: Number, default: 0 },
    }
  },
  activeTradingPool:{
    type: {
      id: String,
      baseMint: String,
      quoteMint: String,
      lpMint: String,
      baseDecimals: Number,
      quoteDecimals: Number,
      lpDecimals: Number,
      version: Number,
      programId: String,
      authority: String,
      openOrders: String,
      targetOrders: String,
      baseVault: String,
      quoteVault: String,
      withdrawQueue: String,
      lpVault: String,
      marketVersion: Number,
      marketProgramId: String,
      marketId: String,
      marketAuthority: String,
      marketBaseVault: String,
      marketQuoteVault: String,
      marketBids: String,
      marketAsks: String,
      marketEventQueue: String,
      lookupTableAccount: String,
    }
  },
  autobuy_amount: Number,
  cpmm_amountIn: Number,
  cpmm_side: String,
  cpmmPoolId: {},
  cpmmPoolInfo: {},
  latestCommand: String,
  previousCommand: String,
  pnlcard: Boolean,
  currentMode: String,
  latestSlippage: Number,
  metadataMessageId: Number,
  snipeToken: String,
  pumpToken: String,
  latestToken: String,
  snipeAmount: Number,
  snipeSlippage: Number,
  snipeStatus: Boolean,
  snipperLookup: Boolean,
  rugCheckToken: String,
  recipientAddress: String,
  solAmount: Number,
  awaitingWalletAddress: Boolean,
  generatorWallet: String,
  referralCommision: Number,
  poolTime: Number,
  positionPool: Array,
  ispriorityCustomFee: Boolean,
  customPriorityFee: Number,
  positionIndex: Number,
  userProfit: Number,
  allowedReferral: String,
  pump_amountIn: Number,
  pump_side: String,
  pump_amountOut: Number,
  txPriorityFee: Number,
  jupSwap_token: String,
  jupSwap_side: String,
  jupSwap_amount: Number,
  jupSwap: {
    type: {
      token: String,
      side: String,
      amount: Number
    }
  },
  ammAddress: String,
  poolSchedule: {
    type: {
      status: String,
      baseDecimals: Number,
      quoteDecimals: Number,
      lpDecimals: Number,
      baseReserve: String,
      quoteReserve: String,
      lpSupply: String,
      startTime: String
    }
  },
  autoBuyActive: Boolean,
});

export const UserSession = mongoose.model("UserSession", UserSessions);
export const WalletKeys = mongoose.model("WalletKeys", WalletSchema);
export const Portfolios = mongoose.model("Portfolios", UserPortfolioSchema);
export const AllowedReferrals = mongoose.model("AllowedReferrals", AllowedReferralsSchema);
