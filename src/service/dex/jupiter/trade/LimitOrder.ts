import { LimitOrderProvider, ownerFilter, OrderHistoryItem, TradeHistoryItem } from "@jup-ag/limit-order-sdk";
import { Keypair, Connection, PublicKey, VersionedTransaction, TransactionSignature, TransactionMessage } from "@solana/web3.js";
import { addMvxFeesInx, add_mvx_and_ref_inx_fees, sendTx, sendSignedTx, wrapLegacyTx } from '../../../../service/util';
import { BN } from "@coral-xyz/anchor";
import { SOL_ADDRESS,MVX_JUP_REFERRAL } from '../../../../../config';
import { getTokenDataFromBirdEye } from "../../../../api/priceFeeds/birdEye";
import dotenv from "dotenv"; dotenv.config();
import BigNumber from 'bignumber.js';
import { getSolanaDetails, getTokenPriceFromJupiter } from '../../../../api';
import bs58 from 'bs58';

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

/*
 * The Jupiter Limit Order's project account for the Referral Program is
 * 45ruCyfdRkWpRNGEqWzjCiXRHkZs8WXCLQ67Pnpye7Hp referral fees are withdrawable here.
 * Ref: https://station.jup.ag/docs/limit-order/limit-order-with-sdk
 */

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
    pumpTx.sign([userWallet, base]);
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

export async function calculateLimitOrderAmountOut(amount: String, token: String, targetPrice: String): Promise<number> {
  let tokenPrice = new BigNumber(Number(targetPrice)).multipliedBy(1e9);
  let tokenAmount = new BigNumber(Number(amount)).multipliedBy(1e9);
  return tokenPrice.times(tokenAmount).toNumber();
}

export async function getOpenOrders(connection: Connection, owner: Keypair): Promise<OrderHistoryItem[]> {
  const limitOrder = new LimitOrderProvider(connection, new PublicKey(MVX_JUP_REFERRAL));
  return await limitOrder.getOrders([ownerFilter(owner.publicKey)]);
}


export async function getOrderHistory(connection: Connection, owner: Keypair): Promise<OrderHistoryItem[]> {
  const limitOrder = new LimitOrderProvider(connection, new PublicKey(MVX_JUP_REFERRAL));
  return await limitOrder.getOrderHistory({
    wallet: owner.publicKey.toBase58(),
    take: 20, // optional, default is 20, maximum is 100
    // lastCursor: order.id // optional, for pagination
  });
}

export async function getOrderHistoryCount(connection: Connection, owner: Keypair): Promise<number> {
  const limitOrder = new LimitOrderProvider(connection, new PublicKey(MVX_JUP_REFERRAL));
  return await limitOrder.getOrderHistoryCount({
    wallet: owner.publicKey.toBase58(),
  });
}

export async function getTradeHistory(connection: Connection, owner: Keypair): Promise<TradeHistoryItem[]> {
  const limitOrder = new LimitOrderProvider(connection, new PublicKey(MVX_JUP_REFERRAL));
  const history =  await limitOrder.getTradeHistory({
    wallet: owner.publicKey.toBase58(),
    take: 20, // optional, default is 20, maximum is 100
    // lastCursor: order.id // optional, for pagination
  });
  console.log(history);
  return history; 
}

export async function getTradeHistoryCount(connection: Connection, owner: Keypair): Promise<number> {
  const limitOrder = new LimitOrderProvider(connection, new PublicKey(MVX_JUP_REFERRAL));
  return await limitOrder.getTradeHistoryCount({
    wallet: owner.publicKey.toBase58(),
  });
}

export async function cancelOrder(connection: Connection, owner: Keypair, order: PublicKey): Promise<string> {
  const limitOrder = new LimitOrderProvider(connection, new PublicKey(MVX_JUP_REFERRAL));
  const tx = await limitOrder.cancelOrder({owner: owner.publicKey,orderPubKey: order});
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(owner);
  return await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "processed" });
}

export async function cancelBatchOrder(connection: Connection, owner: Keypair, batchOrdersPubKey: PublicKey[]): Promise<string> {
  const limitOrder = new LimitOrderProvider(connection, new PublicKey(MVX_JUP_REFERRAL));
  const tx = await limitOrder.batchCancelOrder({owner: owner.publicKey, ordersPubKey: batchOrdersPubKey});
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(owner);
  return await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "processed" });
}



/*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
/*                  FUNCTION TEST                             */
/*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
// test with : npx ts-node src/service/dex/jupiter/trade/limitOrder.ts

// const connection = new Connection(`${process.env.TRITON_RPC_URL!}${process.env.TRITON_RPC_TOKEN!}`);
// const wallet = Keypair.fromSecretKey(bs58.decode(process.env.TEST_WALLET_PK!));

// setLimitJupiterOrder(connection, {
//   referralWallet: null,
//   referralCommision: null,
//   priorityFee: 0,
// }, true, {
//   // userWallet: wallet,
//   inputToken: 'So11111111111111111111111111111111111111112',
//   inAmount: '0.001',
//   outputToken: 'WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk',
//   targetPrice: '0.000001152',
//   expiredAt: null,
// });


// getTradeHistory(connection, wallet).then(console.log);
// getOrderHistory(connection, wallet).then(console.log);
// getOpenOrders(connection, wallet).then(console.log);
