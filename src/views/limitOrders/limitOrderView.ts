import { PublicKey } from "@metaplex-foundation/js";
import {
  getTokenMetadata,
  getUserTokenBalanceAndDetails,
} from "../../service/feeds";
import { quoteToken } from "../util/dataCalculation";
import { getSolanaDetails } from "../../api";
import { formatNumberToKOrM, getSolBalance } from "../../service/util";
import { RAYDIUM_POOL_TYPE } from "../../service/util/types";
import { Keypair, Connection } from "@solana/web3.js";
import { logErrorToFile } from "../../../error/logger";
import { UserPositions } from "../../db";
import { getTokenDataFromBirdEye } from "../../api/priceFeeds/birdEye";
import { getTokenPriceFromJupiter } from "../../api/priceFeeds/jupiter";
import { LimitOrderProvider, ownerFilter, OrderHistoryItem, TradeHistoryItem } from "@jup-ag/limit-order-sdk";
import { setLimitJupiterOrder, getOpenOrders, cancelOrder, cancelBatchOrder } from "../../service/dex/jupiter/trade/LimitOrder";
import { SOL_ADDRESS } from "../../../config";
import { getPriorityFeeLabel, waitForConfirmation } from "../../service/util";
import bs58 from 'bs58';
import BigNumber from "bignumber.js";

export async function submit_limitOrder(ctx: any) {
  console.log("logged in the function : ", ctx.session.limitOrders);
  const chatId = ctx.chat.id;
  const wallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
  const userWallet: Keypair = Keypair.fromSecretKey(bs58.decode(String(wallet.secretKey)));
  const amountIn = ctx.session.limitOrders.amount;
  const isBuySide = ctx.session.limitOrders.side == "buy";
  const tokenIn = isBuySide ? SOL_ADDRESS : ctx.session.limitOrders.token;
  const tokenOut = isBuySide ? ctx.session.limitOrders.token : SOL_ADDRESS;
  const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
  const referralInfo = { referralWallet: ctx.session.referralWallet, referralCommision: ctx.referralCommision, priorityFee: ctx.session.priorityFees };
  const targetPrice = ctx.session.limitOrders.price;
  const expiredAt = ctx.session.limitOrders.time ? new Date(ctx.session.limitOrders.time) : null;
  console.log('00100-targetPrice', targetPrice);
  console.log('00100-expiredAt', expiredAt);


  setLimitJupiterOrder(connection, referralInfo, isBuySide, {
    userWallet: userWallet,
    inputToken: tokenIn,
    inAmount: amountIn,
    outputToken: tokenOut,
    targetPrice: targetPrice,
    expiredAt: expiredAt,
  }).then(async (txSig: string) => {
    let msg = `🟢 <b>Submit ${isBuySide ? "Buy" : "Sell"} Limit Order:</b> Processing with ${getPriorityFeeLabel(ctx.session.priorityFees)} priotity fee. <a href="https://solscan.io/tx/${txSig}">View on Solscan</a>. Please wait for confirmation...`;
    await ctx.api.sendMessage(chatId, msg, { parse_mode: "HTML", disable_web_page_preview: true, });

    const isConfirmed = await waitForConfirmation(ctx, txSig);
    isConfirmed
      ? await ctx.api.sendMessage(chatId, `🟢 <b>Submit ${isBuySide ? "Buy" : "Sell"} Limit Order:</b> Order has been successfully submitted.\n` + `Order will ${isBuySide ? "Buy" : "Sell"} when price reaches ${ctx.session.limitOrders.price}`, { parse_mode: "HTML" })
      : await ctx.api.sendMessage(chatId, `🔴 <b>${isBuySide ? "Buy" : "Sell"} Limit Order:</b> Order has been failed.`, { parse_mode: "HTML" });

    if (isConfirmed) {
      // pre-fetch the order data
      const wallet = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex].secretKey));
      console.log('wallet:', wallet.publicKey);
      ctx.session.orders = await getOpenOrders(connection, wallet);
      ctx.session.isOrdersLoaded = true;
    }

    console.log(txSig);
  });
}

export async function review_limitOrder_details(ctx: any, isRefresh: boolean) {
  const timeTxt = ctx.session.limitOrders.time ? new Date(ctx.session.limitOrders.time).toLocaleString() : "NA";
  const priority_Level = ctx.session.priorityFees;
  const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
  let raydiumId = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
  const rayPoolKeys = ctx.session.activeTradingPool as RAYDIUM_POOL_TYPE;
  if (!rayPoolKeys) {
    // Handle the case where the pool information is not available
    await ctx.reply("Pool information not available.");
    return;
  }
  const baseMint = rayPoolKeys.baseMint;
  const tokenAddress = new PublicKey(baseMint);
  const tokenMetadataResult = await getTokenMetadata(ctx, tokenAddress.toBase58())
  let orderSummary =
    `📄 <b> Order Summary:</b> \n\n` +
    `- Token: ${tokenMetadataResult.tokenData.symbol} \n` +
    `- Side: ${ctx.session.limitOrders.side} \n` +
    `- SOL Amount: ${ctx.session.limitOrders.amount}  \n` +
    `- Target Price: ${ctx.session.limitOrders.price}  \n` +
    `- Expiration: ${timeTxt}  \n`;

  const options = {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: ` Submit `, callback_data: "submit_limit_order" }, { text: ` Cancel `, callback_data: "closing" },],
      ]
    }
  }

  await ctx.api.sendMessage(ctx.chat.id, orderSummary, options);
}

export async function display_limitOrder_token_details(ctx: any, isRefresh: boolean) {
  const priority_Level = ctx.session.priorityFees;
  const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
  let raydiumId = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
  const rayPoolKeys = ctx.session.activeTradingPool as RAYDIUM_POOL_TYPE;
  if (!rayPoolKeys) {
    // Handle the case where the pool information is not available
    await ctx.reply("Pool information not available.");
    return;
  }
  const baseVault = rayPoolKeys.baseVault;
  const quoteVault = rayPoolKeys.quoteVault;
  const baseDecimals = rayPoolKeys.baseDecimals;
  const quoteDecimals = rayPoolKeys.quoteDecimals;
  const baseMint = rayPoolKeys.baseMint;
  const tokenAddress = new PublicKey(baseMint);
  const chatId = ctx.chat.id;
  const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
  const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
  const [
    birdeyeData,
    tokenMetadataResult,
    solPrice,
    tokenInfo,
    balanceInSOL,
  ] = await Promise.all([
    getTokenDataFromBirdEye(tokenAddress.toString()),
    getTokenMetadata(ctx, tokenAddress.toBase58()),
    getSolanaDetails(),
    quoteToken({
      baseVault,
      quoteVault,
      baseDecimals,
      quoteDecimals,
      baseSupply: baseMint,
      connection,
    }),
    getSolBalance(userPublicKey, connection),
    UserPositions.find({ positionChatId: chatId, walletId: userPublicKey }, { positions: { $slice: -7 } }),
    getUserTokenBalanceAndDetails(
      new PublicKey(userPublicKey),
      tokenAddress,
      connection
    ),
  ]);
  const tokenPriceUSD =
    birdeyeData && birdeyeData.response && birdeyeData.response.data && birdeyeData.response.data.data && birdeyeData.response.data.data.price != null ? birdeyeData.response.data.data.price : tokenInfo.price.times(solPrice).toNumber();
  const tokenPriceSOL = birdeyeData ? tokenPriceUSD / solPrice : tokenInfo.price.toNumber();
  const { birdeyeURL, dextoolsURL, dexscreenerURL, tokenData } =
    tokenMetadataResult;
  const marketCap = birdeyeData?.response.data.data.mc ? birdeyeData.response.data.data.mc : tokenInfo.marketCap.toNumber() * solPrice;
  try {
    const formattedmac = (await formatNumberToKOrM(marketCap)) ?? "NA";
    const balanceInUSD = (balanceInSOL * solPrice).toFixed(2);
    let options: any;
    let messageText: any;

    if (ctx.session.latestCommand == "limitOrders") {
      messageText =
        `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
        `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
        `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
        `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
        `Market Cap: <b>${formattedmac} USD</b>\n` +
        `Token Price: <b> ${tokenPriceUSD.toFixed(9)} USD</b> | <b> ${tokenPriceSOL.toFixed(9)} SOL</b> \n\n` +
        `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n\n` +
        `<b>Limit Order Steps:</b>\n` +
        `1. Select order side buy or sell.\n` +
        `2. Enter the amount to buy/sell. (in SOL)\n` +
        `3. Set the target price. (in SOL)\n` +
        `3. Set the expiration time.\n` +
        `3. Set the target price to trigger your order.\n`;

      // Handle sell mode and define inline keyboard

      let targetAmtTxt = ctx.session.limitOrders.amount > 0 ? `Order SOL amount: ${ctx.session.limitOrders.amount}.` : null;
      let targetPriceTxt = ctx.session.limitOrders.price > 0 ? `Order target price: ${ctx.session.limitOrders.amount}.` : null;

      let expMinutesTxt = ctx.session.limitOrders.minutes > 0 ? `Minutes ✅` : `Minutes`;
      let expHoursTxt = ctx.session.limitOrders.hours > 0 ? `Hours ✅` : `Hours`;
      let expDaysTxt = ctx.session.limitOrders.days > 0 ? `Days ✅` : `Days`;

      options = {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: " 🔂 Refresh ", callback_data: "refresh_limit_order" }, { text: " ⚙️ Settings ", callback_data: "settings" },],
            [{ text: ` Buy `, callback_data: "set_limit_order_buy" }, { text: ` Sell `, callback_data: "set_limit_order_sell" },],
            [{ text: "Cancel", callback_data: "closing" }]
          ]
        }
      };
    }

    //  { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Med ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },


    // Send or edit the message
    if (isRefresh) {
      await ctx.editMessageText(messageText, options);
    } else {
      await ctx.api.sendMessage(chatId, messageText, options);
    }
  } catch (error: any) {
    console.error("Error in LimOrderTokenMetadata:", error.message);
    await ctx.api.sendMessage(
      chatId,
      "Error getting token data, verify the address..",
      { parse_mode: "HTML" }
    );
  }
}

/**
 * TODO: 
 * Update display & manage orders as on positions flow
 * Cap order to max 10 orders to display
 * 
 * Display orders:
 * 
 * 1.- Order: 0.001 SOL -> 11620 WEN  (get token symbols by inputMint/outputMint)
 * 2.- Order Price: 0.0₇8606 -> SOL per $WEN (oriTakingAmount / oriMakingAmount)
 * 3.- Current Price: outputMint price in SOL (get token price from jupiter api)
 * 3.- Expiry:  9:13 17/05/2024 (-05) (use expiredAt, readable timezone local string time ex: 9:13 17/05/2024 (-05))
 * 4.- Status: Waiting (if waiting) or Filled (if not waiting) - (waiting property)
 * delete unnecessary properties of orderHtml
 *
 * Manage Orders:
 * Like on next/prev of positions management
 * Button to cancel orders (order.account.base) is order id for function cancelOrder(..., id)
 * Button to cancel all orders with function cancelBatchOrder([id1,id2,id3,...]) 
 * 
 */
export async function display_open_orders(ctx: any) {
  const wallet = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex].secretKey));
  const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
  console.log('wallet:', wallet.publicKey);
  const orders: OrderHistoryItem[] = ctx.session.isOrdersLoaded && ctx.session.orders !== null ?
    ctx.session.orders.filter((order: any) => {
      return new Date(order.account.expiredAt?.toNumber()) > new Date(Date.now())
        || order.account.expiredAt === null;
    }) :
    await getOpenOrders(connection, wallet);
  ctx.session.orders = orders;

  if (orders.length > 0) {
    console.log('orders:', orders.toString());

    let messageText = '';
    for (const order of orders) {
      const birdeyeData = await getTokenDataFromBirdEye(order.account.outputMint);
      console.log('birdeyeData', birdeyeData?.response.data.data);
      const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.data.value : 0;
      const tokenPriceSOL = birdeyeData ? new BigNumber(birdeyeData.response.data.data.price).div(solPrice).toFixed(9) : 0;
      console.log('tokenPriceSOL', tokenPriceSOL);

      let status = order.account.waiting ? 'Waiting' : 'Filled';
      const expiryDate = new Date(order.account.expiredAt?.toNumber());
      console.log('expiryDate', expiryDate);
      console.log('order.account.expiredAt?.toNumber()', order.account.expiredAt?.toNumber());

      const expiry = order.account.expiredAt == null ? 'NO EXPIRY' : expiryDate.toLocaleString();

      messageText +=
        ` - Ordered Token: ${birdeyeData?.response.data.data.symbol} \n` +
        
        // We cannot hardcode the decimals, it will fail when token decimals change 
        // we need to get decimals from the token metadata

        // If its a buy oriMakingAmount is sol = 1e9 and oriTakingAmount is tokenDecimals
        // and the inverse for sell
        // check config.ts for ref of some tokens with diff decimals

        // for this buy case:
        // this has to be oriTakingAmount / 10 ** 9, (SOL DECIMALS = 1e9)
        ` - Order Amount: ${order.account.oriMakingAmount.toNumber() / 10000000000} SOL \n` +
        
        // this has to be oriTakingAmount / 10 ** tokenDecimals
        ` - Target Price: ${order.account.oriTakingAmount.toNumber() / 1000000000000000} SOL \n` +
        
        ` - Current Price: <b> ${tokenPriceSOL} SOL</b> \n` +
        ` - Expiration: ${expiry} \n` +
        ` - Status: ${status} \n\n`;
    }

    const options = {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            { text: `Manage Orders `, callback_data: "manage_limit_orders" },
            { text: `Refresh Orders `, callback_data: "refresh_limit_orders" },
          ],
          [
            { text: `Cancel All Orders `, callback_data: "cancel_all_orders" }
          ],
        ]
      }
    }
    await ctx.api.sendMessage(ctx.chat.id, messageText, options);
    ctx.session.isOrdersLoaded = false;
  } else {
    await ctx.api.sendMessage(ctx.chat.id, 'your order list is empty.');
  }

}

export async function display_single_order(ctx: any, isRefresh: boolean) {
  const wallet = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex].secretKey));
  const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
  console.log('wallet:', wallet.publicKey);
  const orders: OrderHistoryItem[] = ctx.session.isOrdersLoaded && ctx.session.orders !== null ?
    ctx.session.orders.filter((order: any) => {
      return new Date(order.account.expiredAt?.toNumber()) > new Date(Date.now())
        || order.account.expiredAt === null;
    }) :
    await getOpenOrders(connection, wallet);
  ctx.session.orders = orders;

  if (orders.length > 0) {
    let index = ctx.session.orderIndex ?? 0;
    let order = orders[index];

    let messageText;
    const birdeyeData = await getTokenDataFromBirdEye(order.account.outputMint.toBase58());
    console.log('birdeyeData', birdeyeData?.response.data.data);

    const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.data.value : 0;
    const tokenPriceSOL = birdeyeData ? new BigNumber(birdeyeData.response.data.data.price).div(solPrice).toFixed(9) : 0;
    console.log('tokenPriceSOL', tokenPriceSOL);


    let status = order.account.waiting ? 'Waiting' : 'Filled';
    const expiryDate = new Date(order.account.expiredAt?.toNumber());
    const expiry = order.account.expiredAt == null ? 'NO EXPIRY' : expiryDate.toLocaleString();
    console.log('expiryDate', expiryDate);
    console.log('order.account.expiredAt?.toNumber()', order.account.expiredAt?.toNumber());

    messageText =
      ` - Ordered Token: ${birdeyeData?.response.data.data.symbol} \n` +
      ` - Order Amount: ${order.account.oriMakingAmount.toNumber() / 10000000000} SOL \n` +
      ` - Target Price: ${order.account.oriTakingAmount.toNumber() / 1000000000000000} SOL \n` +
      ` - Current Price: <b> ${tokenPriceSOL} SOL</b> \n` +
      ` - Expiration: ${expiry} \n` +
      ` - Status: ${status} \n\n`;

    let prevIndex = index - 1 < 0 ? orders.length - 1 : index - 1;
    let nextIndex = index + 1 >= orders.length ? 0 : index + 1;

    console.log('order', order);

    const options = {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⏮️ Previous', callback_data: `prev_order_${prevIndex}` },
            { text: 'Next ⏭️', callback_data: `next_order_${nextIndex}` }
          ],
          [
            { text: `Cancel Order`, callback_data: `cancel_limit_orders_${order.publicKey}` },
            { text: `Refresh Order`, callback_data: "refresh_single_orders" },
          ],
        ]
      }
    }

    if (isRefresh) {
      await ctx.editMessageText(messageText, options);
    } else {

      await ctx.api.sendMessage(ctx.chat.id, messageText, options);
    }

  } else {
    await ctx.api.sendMessage(ctx.chat.id, 'your order list is empty.');
  }

}

export async function cancel_all_orders(ctx: any) {
  const wallet = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex].secretKey));
  const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
  console.log('wallet:', wallet.publicKey);
  const orders: OrderHistoryItem[] = await getOpenOrders(connection, wallet);

  if (orders.length > 0) {
    let index = ctx.session.orderIndex ?? 0;
    let order = orders[index];

    let orderKeys: PublicKey[] = [];
    for (const order of orders) {
      orderKeys.push(order.publicKey);
    }

    const txSig = await cancelBatchOrder(connection, wallet, orderKeys);
    console.log('txSig', txSig);
    const isConfirmed = await waitForConfirmation(ctx, txSig);

    const msg = `🟢 <b>All Orders cancelled successfully:</b><a href="https://solscan.io/tx/${txSig}"> view transaction</a> on Solscan.`;
    isConfirmed ?
      ctx.api.sendMessage(ctx.chat.id, msg, { parse_mode: "HTML" }) :
      ctx.api.sendMessage(ctx.chat.id, `🔴 <b> Cancel Order has been failed.</b> `, { parse_mode: "HTML" });
    // display_single_order
    if (isConfirmed) {
      ctx.session.orders = null;
    }

  } else {
    await ctx.api.sendMessage(ctx.chat.id, 'your order list is empty.');
  }

}


