import mongoose from 'mongoose';
import {
  Raydium_official_pools,
  Raydium_unOfficial_pools, Portfolios } from './schema';
import axios from 'axios';
import dotenv from 'dotenv';
import { PublicKey } from "@metaplex-foundation/js";
import bs58 from "bs58";
import { RAYDIUM_POOL_TYPE,DEFAULT_PUBLIC_KEY,DefaultPoolInfoData} from '../../service/util/types';
import { MongoDBAdapter, ISession } from "@grammyjs/storage-mongodb";

dotenv.config();
const user = encodeURIComponent(process.env.DB_USER!);
const password = encodeURIComponent(process.env.DB_PASSWORD!);
const ec2_user = encodeURIComponent(process.env.EC2_CRON_USER!);
const ec2_password = encodeURIComponent(process.env.EC2_DB_PASSWORD!);

const isProd = process.env.NODE_ENV == 'PROD';

const authMechanism = 'SCRAM-SHA-1';

const local_url = `mongodb://127.0.0.1:27017/test`;


/**
 * All DB functions are prefized with an underscore (_)
 */
export async function _initDbConnection() {
  // const db =  await mongoose.connect(local_url, { useNewUrlParser: true, useUnifiedTopology: true });

   mongoose.connect(local_url,{
      /** Set to false to [disable buffering](http://mongoosejs.com/docs/faq.html#callback_never_executes) on all models associated with this connection. */
      /** The name of the database you want to use. If not provided, Mongoose uses the database name from connection string. */
      dbName: 'test',
      /** username for authentication, equivalent to `options.auth.user`. Maintained for backwards compatibility. */
      user: isProd ? ec2_user : user,
      autoIndex: true,
      /** password for authentication, equivalent to `options.auth.password`. Maintained for backwards compatibility. */
      pass: isProd ? ec2_password:password,
    });
  const db = mongoose.connection;
  db.on('error', console.error.bind(console, 'ERR connection error:'));
  db.once('open', function () {
    console.log("Connected to DB");
  });
}

const SOL_TOKEN = "So11111111111111111111111111111111111111112";

export async function _findSOLPoolByBaseMint(baseMintValue: PublicKey) :  Promise<RAYDIUM_POOL_TYPE> {
  try {
    // Search in unofficial pools
    let pool : RAYDIUM_POOL_TYPE | null = await Raydium_unOfficial_pools.findOne({ baseMint: baseMintValue, quoteMint: SOL_TOKEN });
    console.log("pool", pool);
    if (pool?.baseMint != DEFAULT_PUBLIC_KEY) {
      return pool as RAYDIUM_POOL_TYPE;
    }

    // If not found in unofficial pools, search in official pools
    pool = await Raydium_official_pools.findOne({ baseMint: baseMintValue, quoteMint: SOL_TOKEN });
    if (pool?.baseMint != DEFAULT_PUBLIC_KEY) {
      return pool as RAYDIUM_POOL_TYPE;
    }
  } catch (err: any) {
    console.log(`No pool found with baseMint: ${baseMintValue}`,err.message);
  }
  return DefaultPoolInfoData as RAYDIUM_POOL_TYPE;
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
      ]
    });
    walletInfoV2.save();
  } catch (err) {
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


// _initDbConnection()
// _findSOLPoolByBaseMint(
//   new PublicKey("DFsahGoY2GT5gUnTcCy6nmHLdoFma2DAtgCuz4uopjfc")
//   ).then((pool) => {console.log(pool)});


