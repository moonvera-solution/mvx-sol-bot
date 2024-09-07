import { LimitOrderProvider, ownerFilter, OrderHistoryItem, TradeHistoryItem } from "@jup-ag/limit-order-sdk";
import { Keypair, Connection, PublicKey, VersionedTransaction, TransactionSignature, TransactionMessage, ComputeBudgetProgram } from "@solana/web3.js";
import { addMvxFeesInx, add_mvx_and_ref_inx_fees, sendTx, wrapLegacyTx, optimizedSendAndConfirmTransaction } from '../../../util';
import { BN } from "@coral-xyz/anchor";
import { SOL_ADDRESS, MVX_JUP_REFERRAL } from '../../../../config';
import dotenv from "dotenv"; dotenv.config();
import BigNumber from 'bignumber.js';
import bs58 from 'bs58';
import { version } from "node:os";
import { getTokenDataFromBirdEyePositions } from "../../../../api/priceFeeds/birdEye";

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

export async function jupiter_limit_order(ctx: any,
  connection: Connection, referralInfo: REFERRAL_INFO, isBuySide: boolean, {
    userWallet,
    inputToken,
    inAmount,
    outputToken,
    targetPrice,
    expiredAt,
  }: LIMIT_ORDER_PARAMS): Promise<TransactionSignature | null> {
  try {

    const limitOrder = new LimitOrderProvider(connection, new PublicKey(MVX_JUP_REFERRAL));
    const base = Keypair.generate(); // random unique order id
    const hasReferral = referralInfo.referralWallet && referralInfo.referralCommision;

    let expectedAmountOut = isBuySide? await CalculateLimitOrderAmountout(inputToken, inAmount, outputToken, targetPrice, ctx) : ctx.session.expectedAmountOut;
    let amountIn = isBuySide? new BN(Number(inAmount) * 1e9): new BN(Number(ctx.session.limitOrders_amount));
 
    const { tx } = await limitOrder.createOrder({
      owner: new PublicKey(userWallet.publicKey),
      inputMint: new PublicKey(inputToken),
      outputMint: new PublicKey(outputToken),
      outAmount: new BN(expectedAmountOut),
      inAmount: amountIn,
      base: base.publicKey,
      expiredAt: expiredAt ? new BN(expiredAt.valueOf() / 1000) : null,
    });
    let maxPriorityFee = Math.ceil(Number.parseFloat(String(ctx.session.customPriorityFee)) * 1e9);
    tx.instructions.push(ComputeBudgetProgram.setComputeUnitPrice({microLamports: maxPriorityFee }));
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const blockhash = (await connection.getLatestBlockhash()).blockhash;
    let solAmount: BigNumber = isBuySide ? new BigNumber(inAmount) : new BigNumber(expectedAmountOut);
      let mvxFeeFromOrder = isBuySide ? solAmount.multipliedBy(1e9) : new BigNumber(Math.ceil(expectedAmountOut));
    const txInxs = hasReferral ?
    addMvxFeesInx(userWallet,  mvxFeeFromOrder):
      // add_mvx_and_ref_inx_fees(userWallet, referralInfo.referralWallet!, solAmount, referralInfo.referralCommision!) :
      addMvxFeesInx(userWallet,  mvxFeeFromOrder);

    txInxs.forEach((inx) => {  tx.add(inx); });
    tx.sign(userWallet,base);

    const versionTx : VersionedTransaction =  new VersionedTransaction(wrapLegacyTx(tx.instructions, userWallet, blockhash));
    versionTx.sign([userWallet, base]);
    
    return await optimizedSendAndConfirmTransaction( versionTx,connection, blockhash, 50);

  } catch (e: any) {
    console.log(e);
    throw new Error(e.message);
  }
}

export async function CalculateLimitOrderAmountout (inputToken: string, inAmount: string, outputToken: string, targetPrice: string, ctx: any): Promise<number> {
  const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
  const feeAccount = null;
  let userWallet: any;

  if (ctx.session.portfolio) {
    const selectedWallet = ctx.session.portfolio.activeWalletIndex;
    userWallet = ctx.session.portfolio.wallets[selectedWallet];
  }  
  const publicKeyString: any = userWallet.publicKey;
  let jupTokenPrice = 0;
  let swapUrl = `${rpcUrl}/jupiter/quote?inputMint=${inputToken}&outputMint=${outputToken}&amount=${Number(inAmount) * 1e9}&slippageBps=0${feeAccount ? '&platformFeeBps=0' : ''}`.trim();
  const [quoteResponse,jupTokenRate,jupSolPrice,birdeyeData ] = await Promise.all([
    fetch(swapUrl).then(res => res.json()),
    fetch(`https://price.jup.ag/v6/price?ids=${outputToken}&vsToken=So11111111111111111111111111111111111111112`).then((response) => response.json()),
    fetch(`https://price.jup.ag/v6/price?ids=SOL`).then((response) => response.json()),
    getTokenDataFromBirdEyePositions(outputToken, publicKeyString),

  ]) 

  const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.value :  Number(jupSolPrice.data.SOL.price);
  // console.log('solPrice', solPrice);
  const tokenPriceUSD = birdeyeData
    && birdeyeData.response
    && birdeyeData.response.data
    && birdeyeData.response.data.price != null  // This checks for both null and undefined
    ? birdeyeData.response.data.price
    : Number(jupTokenPrice) *  Number(solPrice);  
    const tokenPriceSOL = tokenPriceUSD / solPrice;
    console.log('tokenPriceSOL', tokenPriceSOL);
    let currentRate = quoteResponse.outAmount;
    let expectedAmountOut = Number(targetPrice) <= tokenPriceSOL ? tokenPriceSOL / Number(targetPrice) * currentRate :  Number(targetPrice) /tokenPriceSOL  * currentRate; 
    ctx.session.expectedAmountOut = expectedAmountOut;
  return expectedAmountOut;
}

export async function fetchOpenOrders(owner: Keypair): Promise<OrderHistoryItem[]> {
  const limitOrder = await fetch(`https://jup.ag/api/limit/v1/openorders?wallet=${owner.publicKey}`).then((response) => response.json());
  return limitOrder;

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
  const history = await limitOrder.getTradeHistory({
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

export async function cancelOrder(connection: Connection, owner: Keypair, order: PublicKey,ctx: any): Promise<TransactionSignature | null> {
  const limitOrder = new LimitOrderProvider(connection, new PublicKey(MVX_JUP_REFERRAL));
  const tx = await limitOrder.cancelOrder({ owner: owner.publicKey, orderPubKey: order });
  let maxPriorityFee = Math.ceil(Number.parseFloat(String(ctx.session.customPriorityFee)) * 1e9);
  tx.instructions.push(ComputeBudgetProgram.setComputeUnitPrice({microLamports: maxPriorityFee }));
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const blockhash = (await connection.getLatestBlockhash()).blockhash;
  const versionTx : VersionedTransaction =  new VersionedTransaction(wrapLegacyTx(tx.instructions,owner , blockhash));

  tx.sign(owner);
  versionTx.sign([owner]);

  return await optimizedSendAndConfirmTransaction( versionTx,connection, blockhash, 50);
}

export async function cancelBatchOrder(connection: Connection, owner: Keypair, batchOrdersPubKey: PublicKey[], ctx: any):  Promise<TransactionSignature | null> {
  const limitOrder = new LimitOrderProvider(connection, new PublicKey(MVX_JUP_REFERRAL));
  const tx = await limitOrder.batchCancelOrder({ owner: owner.publicKey, ordersPubKey: batchOrdersPubKey });
  let maxPriorityFee = Math.ceil(Number.parseFloat(String(ctx.session.customPriorityFee)) * 1e9);
  tx.instructions.push(ComputeBudgetProgram.setComputeUnitPrice({microLamports: maxPriorityFee }));

  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const blockhash = (await connection.getLatestBlockhash()).blockhash;
  const versionTx : VersionedTransaction =  new VersionedTransaction(wrapLegacyTx(tx.instructions,owner , blockhash));
  
  tx.sign(owner);
  versionTx.sign([owner]);

  return await optimizedSendAndConfirmTransaction( versionTx,connection, blockhash, 50);
}

export async function calculateOrderSellAmount(inputToken: string, inAmount: string, outputToken: string, targetPrice: string, ctx: any): Promise<number> {
  const feeAccount = null;
  let userWallet: any;
  const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`

  if (ctx.session.portfolio) {
    const selectedWallet = ctx.session.portfolio.activeWalletIndex;
    userWallet = ctx.session.portfolio.wallets[selectedWallet];
  }  
  const publicKeyString: any = userWallet.publicKey;
  let jupTokenPrice = 0;

  let swapUrl = `${rpcUrl}/jupiter/quote?inputMint=${inputToken}&outputMint=${outputToken}&amount=${Number(inAmount)}&slippageBps=0${feeAccount ? '&platformFeeBps=0' : ''}`.trim();
  const [quoteResponse,jupTokenRate,jupSolPrice,birdeyeData ] = await Promise.all([
    fetch(swapUrl).then(res => res.json()),
    fetch(`https://price.jup.ag/v6/price?ids=${outputToken}&vsToken=${inputToken}`).then((response) => response.json()),
    fetch(`https://price.jup.ag/v6/price?ids=SOL`).then((response) => response.json()),
    getTokenDataFromBirdEyePositions(inputToken, publicKeyString),

  ]) 

  const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.value :  Number(jupSolPrice.data.SOL.price);
  const tokenPriceUSD = birdeyeData
    && birdeyeData.response
    && birdeyeData.response.data
    && birdeyeData.response.data.price != null  // This checks for both null and undefined
    ? birdeyeData.response.data.price
    : Number(jupTokenPrice) *  Number(solPrice);  
    const tokenPriceSOL = tokenPriceUSD / solPrice;
    let currentRate = quoteResponse.outAmount;
    let expectedAmountOut = Number(targetPrice) >= tokenPriceSOL ? Number(targetPrice) /tokenPriceSOL  * currentRate: tokenPriceSOL / Number(targetPrice) * currentRate   ; 
    ctx.session.expectedAmountOut = expectedAmountOut;
    // console.log('expectedAmountOut', expectedAmountOut);
  return expectedAmountOut;
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
