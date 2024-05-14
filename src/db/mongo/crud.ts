import mongoose from 'mongoose';
import {
  Portfolios, Referrals
} from './schema';
import dotenv from 'dotenv'; dotenv.config();
import { PublicKey } from "@metaplex-foundation/js";
import bs58 from "bs58";
import { SecretsManagerClient, GetSecretValueCommand, } from "@aws-sdk/client-secrets-manager";
const user = 'mvxKing'//encodeURIComponent(process.env.DB_USER!);
const password = 'kingstonEmpireOfTheSun'// encodeURIComponent(process.env.DB_PASSWORD!);
const isProd = true// process.env.NODE_ENV == 'PROD';
const local_url = `mongodb://127.0.0.1:27017/test`;

// https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/getting-started.html
export async function anon(): Promise<any> {
  const secret_name = "mvx-bot-db"
  const client = new SecretsManagerClient({
    region: "ca-central-1",
  });

  let response;

  try {
    response = await client.send(
      new GetSecretValueCommand({
        SecretId: secret_name,
        VersionStage: "AWSCURRENT", // VersionStage defaults to AWSCURRENT if unspecified
      })
    );
  } catch (error: any) {
    // For a list of exceptions thrown, see
    // https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
    throw error;
  }
  return response.SecretString;
}
/**
 * All DB functions are prefized with an underscore (_)
 */
export async function _initDbConnection(): Promise<any> {
  // const db =  await mongoose.connect(local_url, { useNewUrlParser: true, useUnifiedTopology: true });
  let _anon;
  if(isProd){
    _anon = JSON.parse(await anon());
  }


  await mongoose.connect(isProd ? _anon.db : local_url, {
    user: isProd ? _anon.usr : user,
    pass: isProd ? _anon.pw : password,
    autoIndex: true,
  });

  console.log("isProd",isProd, _anon.usr);

  const db = mongoose.connection;
  db.on('error', console.error.bind(console, 'ERR connection error:'));
  db.once('open', function () {
    console.log("Connected to DB");
  });
  console.log("db state: ",db.readyState)

  return _anon;
}



export async function _savePortfolio(
  chatId: Number,
  publicKey: String,
  secretKey: Uint8Array
) {
  try {
    const walletInfoV2 = new Portfolios({
      "chatId": chatId,
      "wallets": [
        {
          "walletId": publicKey,
          "publicKey": publicKey,
          "secretKey": bs58.encode(secretKey),
        }
      ],
      "positions": [

      ],

    });
    walletInfoV2.save();
  } catch (err:any) {
    console.error(err);
  }
}

export async function _getUserWalletByIndex(chatId: Number, index: Number) {
  const hasWallet = await Portfolios.findOne(
    { chatId: chatId },
    { wallets: { $slice: index } }
  );
  console.log("hasWallet", hasWallet);
}

export async function _dropUser(chatId: Number) {
  try {
    const hasWallet = await Portfolios.deleteOne({ chatId: chatId });
    return true
  } catch (err) {
    console.error(err);
    return false;
  }
}

async function generateUniqueReferralCode() {
  let unique = false;
  let referralCode;
  while (!unique) {
    referralCode = Math.random().toString(36).substring(2, 15);
    const existingCode = await Referrals.findOne({ referralCode: referralCode });
    if (!existingCode) {
      unique = true;
    }
  }
  return referralCode;
}

export async function _generateReferralLink(ctx: any, walletAddress: PublicKey) {
  const chatId = ctx.chat.id;
  let referralCode;
  let referralLink;

  try {
    let existingReferral = await Referrals.findOne({ generatorChatId: chatId });

    if (!existingReferral) {
      referralCode = await generateUniqueReferralCode();
      const newReferral = new Referrals({
        generatorChatId: chatId,
        generatorWallet: walletAddress, // Use the provided wallet address by user
        referralCode: referralCode,
        earnings: 0,
        numberOfReferrals: 0,
        commissionPercentage: 35,
        referredUsers: [],
      });
      await newReferral.save();
    } else {
      referralCode = existingReferral.referralCode;
    }
    //MVXBOT_bot for live prod
    referralLink = `https://t.me/DRIBs_bot?start=${referralCode}`;
  } catch (error: any) {
    console.error('Error in _generateReferralLink:', error);
    throw new Error('Unable to process referral link.');
  }

  return referralLink;
}

export async function _getReferralData(ctx: any) {
  const chatId = ctx.chat.id;
  try {
    // Fetch the referral record for this user
    const referralRecord = await Referrals.findOne({ generatorChatId: chatId });

    if (!referralRecord) {
      return null;
    }

    // Return the data from the found referral record
    return {
      referralCode: referralRecord.referralCode,
      referralLink: `https://t.me/DRIBs_bot?start=${referralRecord.referralCode}`,
      numberOfReferrals: referralRecord.numberOfReferrals,
      totalEarnings: referralRecord.earnings,
      commissionPercentage: referralRecord.commissionPercentage,
      count: referralRecord.numberOfReferrals,
      referralWallet: referralRecord.generatorWallet,
    };
  } catch (error: any) {
    console.error('Error fetching referral data:', error);
    return null; // handle the error 
  }
}