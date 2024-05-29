import { PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getUserTokenBalanceAndDetails } from '../../service/feeds';
import { quoteToken } from './../util/dataCalculation';
import { formatNumberToKOrM, getSolBalance } from '../../service/util';
import { RAYDIUM_POOL_TYPE } from '../../service/util/types';
import {CONNECTION} from '../../config';
import {  Connection } from '@solana/web3.js';
import { runAllFees } from '../util/getPriority';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { UserPositions } from '../../db';
import { getTokenDataFromBirdEye, getTokenDataFromBirdEyePositions } from '../../api/priceFeeds/birdEye';

export async function display_snipe_options(ctx: any, isRefresh: boolean, msgTxt?: string) {
  try {
    let messageText;
    let priority_Level = ctx.session.priorityFees;
    const priority_custom = ctx.session.ispriorityCustomFee;
    if(priority_custom === true){
      priority_Level = 0;
    }
    let raydiumId = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
    const activePool = ctx.session.activeTradingPool;
    const connection = CONNECTION;
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
    // console.log("activePool",activePool)
    if (!msgTxt && !activePool) { await ctx.api.sendMessage(ctx.chat.id, "Enter token address to snipe.", { parse_mode: 'HTML' }); return; }

    if (activePool && activePool.baseMint != DEFAULT_PUBLIC_KEY) {

      const rayPoolKeys: RAYDIUM_POOL_TYPE = ctx.session.activeTradingPool;

      const baseVault = rayPoolKeys.baseVault;
      const quoteVault = rayPoolKeys.quoteVault;
      const baseDecimals = rayPoolKeys.baseDecimals;
      const quoteDecimals = rayPoolKeys.quoteDecimals;
      const baseMint = rayPoolKeys.baseMint;
      const chatId = ctx.chat.id;
      const tokenAddress = new PublicKey(ctx.session.snipeToken);

      const [
        birdeyeData,
        tokenMetadataResult,
        tokenInfo,
        balanceInSOL,
        userTokenDetails,
        jupSolPrice
      ] = await Promise.all([
        getTokenDataFromBirdEye(tokenAddress.toString(),userPublicKey),
        getTokenMetadata(ctx, tokenAddress.toBase58()),
        quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint, connection }),
        getSolBalance(userPublicKey, connection),
        getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress, connection),
        fetch(
          `https://price.jup.ag/v6/price?ids=SOL`
        ).then((response) => response.json()),
      ]);

      const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.value :  Number(jupSolPrice.data.SOL.price);


      const {
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
        tokenData,
      } = tokenMetadataResult;
      const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;
      
      const tokenPriceUSD = birdeyeData
      && birdeyeData.response
      && birdeyeData.response.data
      // && birdeyeData.response.data.data
      && birdeyeData.response.data.price != null  // This checks for both null and undefined
      ? birdeyeData.response.data.price
      : tokenInfo.price.times(solPrice).toNumber();

      const baseSupply = birdeyeData
  && birdeyeData.response
  && birdeyeData.response.data
  // && birdeyeData.response.data.data
  && birdeyeData.response.data.supply != null  // This checks for both null and undefined
  ? birdeyeData.response.data.supply
  : Number(tokenInfo.baseTokenSupply.dividedBy(Math.pow(10, baseDecimals)));
  const mcap = baseSupply * tokenPriceUSD;  
  const formattedmac = await formatNumberToKOrM(mcap) ?? "NA";

      ctx.session.currentMode = 'snipe';
      // showing the user the countdowm to the snipe
      const currentTime = new Date();
      const poolStartTime = new Date(ctx.session.poolTime * 1000);

      let poolStatusMessage;
      if (currentTime >= poolStartTime) {
        poolStatusMessage = "✅ Opened";
      } else {
        const timeDiff = Number(poolStartTime) - Number(currentTime);
        const countdown = new Date(timeDiff).toISOString().substr(11, 8);
        poolStatusMessage = `⏳ Opening in ${countdown}`;
      }
      console.log('(tokenInfo.price.times(solPrice)', (tokenInfo.price.times(solPrice).toNumber()));
     
      const tokenPriceSOL = birdeyeData ? (tokenPriceUSD / solPrice) : tokenInfo.price.toNumber();

      const priceImpact = tokenInfo.priceImpact.toFixed(2);
      // const priceImpact_1 = tokenInfo.priceImpact_1.toFixed(2);


      const balanceInUSD = (balanceInSOL * (solPrice)).toFixed(2);

      messageText = `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
        `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
        `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
        `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
        `Market Cap: <b>${formattedmac} USD</b>\n` +
        `Token Price: <b> ${tokenPriceUSD.toFixed(9)} USD</b> | <b> ${tokenPriceSOL.toFixed(9)} SOL</b> \n\n` +
        // `💧 Liquidity: <b>${(formattedLiquidity)}</b>  USD\n` + 
        `price Impact (5.0 SOL) : <b>${priceImpact}%</b> \n\n` +
        `Pool Status: <b>${poolStatusMessage}</b>\n\n` +
        // `--<code>Priority fees</code>--\n Low: ${(Number(mediumpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(highpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(maxpriorityFees) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
        `Token Balance: <b>${userTokenBalance.toFixed(3)} $${userTokenSymbol} </b> | <b>${((userTokenBalance) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
        `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n `;
    } else {
      ctx.session.snipeToken = ctx.session.snipeToken instanceof PublicKey ? ctx.session.snipeToken.toBase58() : ctx.session.snipeToken;
      const { tokenData } = await getTokenMetadata(ctx, ctx.session.snipeToken);
      messageText = `<b>${tokenData.name} (${tokenData.symbol})</b> | 📄 CA: <code>${msgTxt}</code> <a href="copy:${msgTxt}">🅲</a>\n` +
        `No pool available for this token yet. \nSet Sniper by selecting slippage and amount.`;
    }
    if (isRefresh) {
      await ctx.editMessageText(messageText, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: ' 🔂 Refresh ', callback_data: 'refresh_snipe' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
            [{ text: `⛷️ Set snipe slippage (${ctx.session.snipeSlippage}%) 🖋️`, callback_data: 'set_snipe_slippage' }],
            [{ text: '🎯 X SOL', callback_data: 'snipe_X_SOL' }, { text: '🎯 0.5 SOL', callback_data: 'snipe_0.5_SOL' }, { text: '🎯 1 SOL', callback_data: 'snipe_1_SOL' }],
            [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: `Set priority ${ctx.session.customPriorityFee}`, callback_data: 'set_customPriority' }],
            [{ text: 'Cancel', callback_data: 'closing' }]
          ]

        },
      });
    } else {
      await ctx.api.sendMessage(ctx.chat.id, messageText, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: ' 🔂 Refresh ', callback_data: 'refresh_snipe' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
            [{ text: `⛷️ Set snipe slippage (${ctx.session.snipeSlippage}%) 🖋️`, callback_data: 'set_snipe_slippage' }],
            [{ text: '🎯 X SOL', callback_data: 'snipe_X_SOL' }, { text: '🎯 0.5 SOL', callback_data: 'snipe_0.5_SOL' }, { text: '🎯 1 SOL', callback_data: 'snipe_1_SOL' }],
            [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: `Set priority ${ctx.session.customPriorityFee}`, callback_data: 'set_customPriority' }],
            [{ text: 'Cancel', callback_data: 'closing' }]
          ]

        },
      });
    }
  } catch (error: any) {
    console.log('display_snipe_options:', error);
    console.log("display_snipe_options", error);
  }
}
