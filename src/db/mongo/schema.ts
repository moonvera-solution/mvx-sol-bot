import mongoose from "mongoose";
import {
  PORTFOLIO_TYPE,
  RAYDIUM_POOL_TYPE,
  REFERRAL_TYPE,
} from "../../service/util/types";

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


export const Referrals = mongoose.model<REFERRAL_TYPE>(
  "Referrals",
  ReferralSchema
);

export const Raydium_unOfficial_pools = mongoose.model(
  "Raydium_unOfficial_pools",
  PoolInfoSchema
);
export const Raydium_official_pools = mongoose.model(
  "Raydium_official_pools",
  PoolInfoSchema
);

export const WalletKeys = mongoose.model("WalletKeys", WalletSchema);
export const Portfolios = mongoose.model("Portfolios", UserPortfolioSchema);
