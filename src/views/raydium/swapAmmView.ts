import { PublicKey } from "@metaplex-foundation/js";
import {
  getLiquityFromOwner,
  getTokenMetadata,
  getuserShitBalance,
  getUserTokenBalanceAndDetails,
} from "../../service/feeds";
import { getPoolToken_details, quoteToken } from "../util/dataCalculation";
import { CONNECTION } from "../../config";
import { formatNumberToKOrM, getSolBalance } from "../../service/util";
import { RAYDIUM_POOL_TYPE } from "../../service/util/types";
import { Connection, Keypair } from "@solana/web3.js";
export const DEFAULT_PUBLIC_KEY = new PublicKey(
  "11111111111111111111111111111111"
);
import { UserPositions } from "../../db";
import {
  getTokenDataFromBirdEye,
  getTokenDataFromBirdEyePositions,
} from "../../api/priceFeeds/birdEye";
import { initSdk } from "../../service/dex/raydium/cpmm";
import bs58 from "bs58";
import { getAmmV4PoolKeys } from "../../service/dex/raydium/utils/formatAmmKeysById";

export async function display_raydium_details(ctx: any, isRefresh: boolean) {
  console.log("display_raydium_details");
  let priority_Level = ctx.session.priorityFees;
  const priority_custom = ctx.session.ispriorityCustomFee;
  if (priority_custom === true) {
    priority_Level = 0;
  }
  const chatId = ctx.chat.id;
  const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
  const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;

  const connection = CONNECTION;

  // const rayPoolKeys = ctx.session.activeTradingPoolId;
  
  const { poolKeys, rpcData, poolInfo } = await getAmmV4PoolKeys(ctx);

  // console.log("poolKeys:", poolKeys); 
  const LpAddress = poolKeys.mintLp.address;
  const [baseReserve, quoteReserve, status] = [
    rpcData.baseReserve,
    rpcData.quoteReserve,
    rpcData.status.toNumber(),
  ];

  const baseVault = rpcData.baseVault;
  const quoteVault = rpcData.quoteVault;
  const baseDecimals = Number(rpcData.baseDecimal);
  const quoteDecimals = Number(rpcData.quoteDecimal);
  const baseMint = rpcData.baseMint;
  const tokenAddress = new PublicKey(baseMint);

  const [
    birdeyeData,
    balanceInSOL,
    userPosition,
    jupSolPrice,
    shitBalance,
    tokenInfo,
    tokenMetadataResult,
  ] = await Promise.all([
    getTokenDataFromBirdEyePositions(tokenAddress.toString(), userPublicKey),
    getSolBalance(userPublicKey, connection),
    UserPositions.find(
      { walletId: userPublicKey },
      { positions: { $slice: -7 } }
    ),
    fetch(`https://price.jup.ag/v6/price?ids=SOL`).then((response) =>
      response.json()
    ),
    getuserShitBalance(userPublicKey, tokenAddress, connection),
    getPoolToken_details(baseVault, quoteVault, baseMint, connection),
    getTokenMetadata(ctx, tokenAddress.toBase58()),  ]);
     const {
      birdeyeURL,
      dextoolsURL,
      dexscreenerURL,
      tokenData,
    } = tokenMetadataResult;
  // console.log("quoteToken:", quoteToken);
  const solPrice = birdeyeData? birdeyeData.solanaPrice.data.value : Number(jupSolPrice.data.SOL.price);


  const tokenPriceUSD = birdeyeData &&
      birdeyeData.response &&
      birdeyeData.response.data &&
      birdeyeData.response.data.price != null // This checks for both null and undefined
      ? birdeyeData.response.data.price
      : (Number(quoteReserve) / Number(baseReserve) / Math.pow(10, quoteDecimals - baseDecimals)) * solPrice;
  
    console.log('tokenPriceUSD:', (Number(quoteReserve) / Number(baseReserve) / Math.pow(10, quoteDecimals - baseDecimals)) );
      const tokenPriceSOL = birdeyeData ? tokenPriceUSD / solPrice : Number(baseReserve) / Math.pow(10, quoteDecimals - baseDecimals);
  let specificPosition;
  if (
    userPosition[0] &&
    userPosition[0].positions &&
    userPosition[0].positions != undefined
  ) {
    specificPosition = userPosition[0].positions.find((pos: any) =>
      new PublicKey(pos.baseMint).equals(tokenAddress)
    );
  }
  console.log("specificPosition:", specificPosition);
  let initialInUSD = 0;
  let initialInSOL = 0;
  let valueInUSD: any;
  let valueInSOL: any;
  let profitPercentage;
  let profitInUSD;
  let profitInSol;
  if (specificPosition && specificPosition.amountOut) {
    valueInUSD = specificPosition.amountOut - shitBalance.userTokenBalance * Math.pow(10, baseDecimals) <  5 ? shitBalance.userTokenBalance * Number(tokenPriceUSD): "N/A";
    valueInSOL = specificPosition.amountOut - shitBalance.userTokenBalance * Math.pow(10, baseDecimals) < 5 ? Number(shitBalance.userTokenBalance * Number(tokenPriceSOL)): "N/A";
    console.log("valueInSOL:", valueInSOL);
    initialInSOL = Number(specificPosition.amountIn) / 1e9;
    initialInUSD = initialInSOL * Number(solPrice);
    profitPercentage = valueInSOL != "N/A" ? ((Number(valueInSOL) - Number(specificPosition.amountIn  ) / 1e9) / (Number(specificPosition.amountIn) / 1e9)) * 100 : "N/A";
    profitInUSD = valueInUSD != "N/A" ? Number(Number(shitBalance.userTokenBalance) * Number(tokenPriceUSD)) - initialInUSD: "N/A";
    profitInSol = valueInSOL != "N/A" ? (valueInSOL - initialInSOL).toFixed(4) : "N/A";
  }
  ctx.session.userProfit = profitPercentage;

  // const { birdeyeURL, dextoolsURL, dexscreenerURL, tokenData } = tokenMetadataResult;
  const baseSupply =
    birdeyeData &&
      birdeyeData.response &&
      birdeyeData.response.data &&
      birdeyeData.response.data.supply != null // This checks for both null and undefined
      ? birdeyeData.response.data.supply
      : Number(tokenInfo.baseTokenSupply.dividedBy(Math.pow(10, baseDecimals)));
  const mcap = baseSupply * tokenPriceUSD;
  const netWorth =
    birdeyeData &&
      birdeyeData.birdeyePosition &&
      birdeyeData.birdeyePosition.data &&
      birdeyeData.birdeyePosition.data.totalUsd
      ? birdeyeData.birdeyePosition.data.totalUsd
      : NaN;

  const netWorthSol = netWorth / solPrice;
  const creatorAddress = birdeyeData && birdeyeData.response2.data.creatorAddress!= null ? birdeyeData.response2.data.creatorAddress : tokenData.updateAuthorityAddress.toBase58();
  const lpSupplyOwner = await getLiquityFromOwner(new PublicKey(creatorAddress), new PublicKey(LpAddress), connection);
  const lpSupply = lpSupplyOwner.userTokenBalance;
  const islpBurnt = lpSupply > 0 ? "❌ No" : "✅ Yes";
  const freezable = birdeyeData?.response2.data.freezeable ? "⚠️ Be careful: This token is freezable." : "✅ Not freezable.";

  try {
    const formattedmac = (await formatNumberToKOrM(mcap)) ?? "NA";

    // const priceImpact = tokenInfo.priceImpact.toFixed(2);
    const balanceInUSD = (balanceInSOL * solPrice).toFixed(2);
    // Construct the message
    let options: any;
    let messageText: any;

    messageText =
      `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
      `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
      `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
      `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
      `<b>LP Burnt:</b> ${islpBurnt} | <b>Freezable:</b> ${freezable} \n\n` +   
      `---<code>Token Details</code>---\n` +
      `Market Cap: <b>${formattedmac} USD</b>\n` +
      `Token Price: <b> ${tokenPriceUSD.toFixed(9)} USD</b> | <b> ${tokenPriceSOL.toFixed(9)} SOL</b> \n\n` +
      `---<code>Trade Position</code>---\n` +
      `Initial : <b>${initialInSOL.toFixed(4)} SOL</b> | <b>${initialInUSD.toFixed(4)} USD</b>\n` +
      `Profit: ${profitInSol != "N/A" ? Number(profitInSol).toFixed(4) : "N/A"} <b>SOL</b> | ${profitInUSD != "N/A" ? Number(profitInUSD).toFixed(4) : "N/A"} <b>USD</b> | ${profitPercentage != "N/A" ? Number(profitPercentage).toFixed(2) : "N/A"}%\n` +
      `Token Balance: <b>${shitBalance.userTokenBalance.toFixed(4)} $${poolKeys.mintA.symbol} </b> | <b>${(shitBalance.userTokenBalance * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${( shitBalance.userTokenBalance * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
      // `Price Impact (5.0 SOL) : <b>${priceImpact}%</b> \n\n` +
      // `--<code>Priority fees</code>--\n Low: ${(Number(mediumpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(highpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(maxpriorityFees) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
      `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n ` +
      `Net Worth: <b>${netWorthSol.toFixed(4)}</b> SOL | <b>${netWorth.toFixed(4)}</b> USD\n`;

    // Define buy mode inline keyboard
    options = {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            { text: " 🔂 Refresh ", callback_data: "refresh_trade" },
            { text: " ⚙️ Settings ", callback_data: "settings" },
          ],
          [
            { text: "Buy (X SOL)", callback_data: "buy_X_RAY" },
            { text: "Buy (0.5 SOL)", callback_data: "buy_0.5_RAY" },
            { text: "Buy (1 SOL)", callback_data: "buy_1_RAY" },
          ],
          [
            { text: `Sell X %`, callback_data: "sell_X_RAY" },
            { text: "Sell 50%  ", callback_data: "sell_50_RAY" },
            { text: "Sell 100%  ", callback_data: "sell_100_RAY" },
          ],
          [
            {
              text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`,
              callback_data: "set_slippage",
            },
            {
              text: `Set priority ${ctx.session.customPriorityFee}`,
              callback_data: "set_customPriority",
            },
          ],
          [{ text: `📈 (${tokenData.symbol}) Live chart 📉`, url: `https://t.me/dribs_app_bot/dribs?startapp=${tokenAddress}` }],

          [{ text: "Cancel", callback_data: "closing" }],
        ],
      },
    };

    if (isRefresh) {
      await ctx.editMessageText(messageText, options);
    } else {
      await ctx.api.sendMessage(chatId, messageText, options);
    }
  } catch (error: any) {
    console.error("Error in display_token_details:", error);
    console.error("Error in getTokenMetadata:", error.message);
  }
}
