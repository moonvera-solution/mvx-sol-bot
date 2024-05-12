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
import { setLimitJupiterOrder } from "../../service/dex/jupiter/trade/limitOrder";
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

  setLimitJupiterOrder(connection, referralInfo, isBuySide, {
    userWallet: userWallet,
    inputToken: tokenIn,
    inAmount: amountIn,
    outputToken: tokenOut,
    targetPrice: ctx.session.limitOrders.price,
    expiredAt: ctx.session.limitOrders.time,
  }).then(async (txSig: string) => {
    let msg = `🟢 <b>Submit ${isBuySide ? "Buy" : "Sell"} Limit Order:</b> Processing with ${getPriorityFeeLabel(ctx.session.priorityFees)} priotity fee. <a href="https://solscan.io/tx/${txSig}">View on Solscan</a>. Please wait for confirmation...`;
    await ctx.api.sendMessage(chatId, msg, { parse_mode: "HTML", disable_web_page_preview: true, });

    const isConfirmed = await waitForConfirmation(ctx, txSig);
    isConfirmed
      ? await ctx.api.sendMessage(chatId, `🟢 <b>Submit ${isBuySide ? "Buy" : "Sell"} Limit Order:</b> Order has been successfully submitted.\n` + `Order will ${isBuySide ? "Buy" : "Sell"} when price reaches ${ctx.session.limitOrder.price}`, { parse_mode: "HTML" })
      : await ctx.api.sendMessage(chatId, `🔴 <b>${isBuySide ? "Buy" : "Sell"} Limit Order:</b> Order has been failed.`, { parse_mode: "HTML" });
    console.log(txSig);
  });
}

export async function review_limitOrder_details(ctx: any, isRefresh: boolean) {
  const timeTxt = ctx.session.limitOrders.time ? new Date(ctx.session.limitOrders.time).toLocaleString() : "NA";
  let orderSummary =
    `📄 <b> Order Summary:</b> \n\n` +
    `- Token: WEN \n` +
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

  await ctx.api.sendMessage(ctx.chat.id ,orderSummary, options);
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
        `1. Select oder side buy or sell.\n` +
        `2. Enter the amount to buy/sell. \n` +
        `3. Set the target price.\n` +
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
            [{ text: " 🔂 Refresh ", callback_data: "refresh_trade" }, { text: " ⚙️ Settings ", callback_data: "settings" },],
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
