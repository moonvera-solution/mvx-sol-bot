import { LimitOrderProvider, ownerFilter, OrderHistoryItem, TradeHistoryItem  } from "@jup-ag/limit-order-sdk";
import { Keypair, Connection, PublicKey, VersionedTransaction, TransactionSignature, TransactionMessage } from "@solana/web3.js";
import { addMvxFeesInx, add_mvx_and_ref_inx_fees, sendTx, sendSignedTx, wrapLegacyTx } from '../../../../service/util';
import { BN } from "@coral-xyz/anchor";
import { SOL_ADDRESS } from '../../../../../config';
import { getTokenDataFromBirdEye } from "../../../../api/priceFeeds/birdEye";
import dotenv from "dotenv"; dotenv.config();
import BigNumber from 'bignumber.js';
import { getSolanaDetails, getTokenPriceFromJupiter } from '../../../../api';
import bs58 from 'bs58';
// The Jupiter Limit Order's project account for the Referral Program is
// 45ruCyfdRkWpRNGEqWzjCiXRHkZs8WXCLQ67Pnpye7Hp referral fees are withdrawable here.


function floatStringToBigNumber(floatStr: string) {
  const parts = floatStr.split(".");
  const integerPart = new BN(parts[0]);
  const fractionalPart = new BN(parts[1] || 0);
  const power = new BN(10).exponentiatedBy(
    parts[1] ? parts[1].length : 0
  );

  return integerPart.times(power).plus(fractionalPart);
}

type LIMIT_ORDER_PARAMS = {
  userWallet: Keypair;
  inputToken: string;
  inAmount: string;
  outputToken: string;
  targetPrice: string;
  expiredAt: Date | null;
};

type REFERRAL_INFO = {
  referralWallet: string | null,
  referralCommision: number | null,
  priorityFee: number | null,
}

export async function setLimitJupiterOrder(
  connection: Connection, referralInfo: REFERRAL_INFO, isBuySide: boolean, {
    userWallet,
    inputToken,
    inAmount,
    outputToken,
    targetPrice,
    expiredAt,
  }: LIMIT_ORDER_PARAMS): Promise<TransactionSignature> {
  try {
    const limitOrder = new LimitOrderProvider(connection, new PublicKey(MVX_JUP_REFERRAL));
    const base = Keypair.generate(); // random unique order id
    const hasReferral = referralInfo.referralWallet && referralInfo.referralCommision;

    let outAmount = await calculateLimitOrderAmountOut(inAmount, outputToken, targetPrice);
    console.log("outAmount", outAmount);
    console.log(Number(inAmount) * 10 ** 9);

    const { tx, orderPubKey } = await limitOrder.createOrder({
      owner: new PublicKey(userWallet.publicKey),
      inputMint: new PublicKey(inputToken),
      outputMint: new PublicKey(outputToken),
      outAmount: new BN(outAmount),
      inAmount: new BN(Number(inAmount) * 1e9),
      base: base.publicKey,
      expiredAt: expiredAt ? new BN(expiredAt.valueOf() / 1000) : null,
    });

    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.sign(userWallet, base);
    const blockhash = (await connection.getLatestBlockhash()).blockhash;
    let solAmount: BigNumber = isBuySide ? new BigNumber(inAmount) : new BigNumber(outAmount);

    const versionnedBundle: VersionedTransaction[] = [];
    const pumpTx = new VersionedTransaction(wrapLegacyTx(tx.instructions, userWallet, blockhash));
    pumpTx.sign([userWallet,base]);
    versionnedBundle.push(pumpTx);

    const txInxs = hasReferral ?
      add_mvx_and_ref_inx_fees(userWallet, referralInfo.referralWallet!, solAmount, referralInfo.referralCommision!) :
      addMvxFeesInx(userWallet, solAmount)

    const mvxTx = new VersionedTransaction(wrapLegacyTx(txInxs, userWallet, blockhash));
    mvxTx.sign([userWallet]);
    versionnedBundle.push(mvxTx);
    
    // sign all bundle tx's independently before sending
    return (await sendSignedTx(connection, versionnedBundle, { preflightCommitment: "processed", }))[0];
  } catch (e: any) {
    console.log(e);
    throw new Error(e.message);
  }
}

async function calculateLimitOrderAmountOut(amount: String, token: String, targetPrice: String): Promise<number> {
  let tokenPrice = new BigNumber(Number(targetPrice)).multipliedBy(1e9);
  let tokenAmount = new BigNumber(Number(amount)).multipliedBy(1e9);
  return tokenPrice.times(tokenAmount).toNumber();
}

async function getOpenOrders(ctx:any){
  
}

// urrent price: 000196005
// target price  '0.001' SOL  /  000186005 = outAmount

// type LIMIT_ORDER_PARAMS = {
//   userWallet: Keypair;
//   inputToken: string;
//   inAmount: string;
//   outputToken: string;
//   targetPrice: string;
//   expiredAt: Date | null;
// };

const connection = new Connection(`${process.env.TRITON_RPC_URL!}${process.env.TRITON_RPC_TOKEN!}`);
const MVX_JUP_REFERRAL = "HH2UqSLMJZ9VP9jnneixYKe3oW8873S9MLUuMF3xvjLH";
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.TEST_WALLET_PK!));

const rf = {
  referralWallet: null,
  referralCommision: null,
  priorityFee: 0,
}

const params = {
  userWallet: wallet,
  inputToken: 'So11111111111111111111111111111111111111112',
  inAmount: '0.001',
  outputToken: 'WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk',
  targetPrice: '0.000001152',
  expiredAt: null,
};

// setLimitJupiterOrder(connection, rf, true, params);


// (() => {
//   const f = new BN((0.001 * 0.0000011782225));
//   console.log(f.toString());
// })()