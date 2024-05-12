
import { PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getUserTokenBalanceAndDetails } from '../../service/feeds';
import { quoteToken } from '../util/dataCalculation';
import { getSolanaDetails } from '../..//api';
import { formatNumberToKOrM, getSolBalance } from '../../service/util';
import { RAYDIUM_POOL_TYPE } from '../../service/util/types';
import { Keypair, Connection } from '@solana/web3.js';
import { runAllFees } from '../util/getPriority';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { logErrorToFile } from "../../../error/logger";
import { UserPositions } from '../../db';
import { getTokenDataFromBirdEye } from '../../api/priceFeeds/birdEye';
import { SOL_ADDRESS } from "../../../config";
import {jupiterSimpleSwap} from '../../service/dex/jupiter/trade/swaps';
import bs58 from 'bs58';


export async function jupiterSwap(ctx:any){
    const chatId = ctx.chat.id;
    const wallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
    const userWallet: Keypair = Keypair.fromSecretKey(bs58.decode(String(wallet.secretKey)));
    const amountIn = ctx.session.jupSwap.amount;
    const isBuySide = ctx.session.jupSwap.side == "buy";
    const tokenIn = isBuySide ? SOL_ADDRESS : ctx.session.jupSwap.token;
    const tokenOut = isBuySide ? ctx.session.jupSwap.token : SOL_ADDRESS;
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
    const referralInfo = { referralWallet: ctx.session.referralWallet, referralCommision: ctx.referralCommision, priorityFee: ctx.session.priorityFees };
    const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
    const refObject = { referralWallet: ctx.session.referralWallet, referralCommision: ctx.referralCommision};
    jupiterSimpleSwap(
        connection,
        rpcUrl,
        userWallet,
        isBuySide,
        tokenIn,
        tokenOut,
        amountIn,
        ctx.session.slippage,
        ctx.session.priorityFees,
        refObject
      ).then(txSig => {
        if(txSig){
            ctx.api.sendMessage(chatId, `Swap successful, tx: ${txSig}`, { parse_mode: 'HTML' });
        }else{
            ctx.api.sendMessage(chatId, "Swap failed, please try again", { parse_mode: 'HTML' });
        }
      });
}


export async function display_token_details(ctx: any, isRefresh: boolean) {
    const priority_Level = ctx.session.priorityFees;
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
    let raydiumId = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
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
      // solPrice,
      tokenInfo,
      balanceInSOL,
      userPosition,
      userTokenDetails,
      AllpriorityFees,
  
    ] = await Promise.all([
      getTokenDataFromBirdEye(tokenAddress.toString()),
      getTokenMetadata(ctx, tokenAddress.toBase58()),
      // getSolanaDetails(),
      quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint, connection }),
      getSolBalance(userPublicKey, connection),
      UserPositions.find({ positionChatId: chatId, walletId: userPublicKey }, { positions: { $slice: -7 } }),
      getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress, connection),
      runAllFees(ctx, raydiumId),
    ]);
    const lowpriorityFees = (AllpriorityFees.result);
    const mediumpriorityFees = (AllpriorityFees.result2);
    const highpriorityFees = (AllpriorityFees.result3);
    const maxpriorityFees = (AllpriorityFees.result4);
    const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.data.value : 0;
  
    const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;
    const tokenPriceUSD = birdeyeData
  
      && birdeyeData.response
      && birdeyeData.response.data
      && birdeyeData.response.data.data
      && birdeyeData.response.data.data.price != null  // This checks for both null and undefined
      ? birdeyeData.response.data.data.price
      : tokenInfo.price.times(solPrice).toNumber();
    const tokenPriceSOL = birdeyeData ? (tokenPriceUSD / solPrice) : tokenInfo.price.toNumber();
    let specificPosition;
    if (userPosition[0] && userPosition[0].positions && userPosition[0].positions != undefined) {
      specificPosition = userPosition[0].positions.find((pos: any) => new PublicKey(pos.baseMint).equals(tokenAddress));
  
    }
    let initialInUSD = 0;
    let initialInSOL = 0;
    let valueInUSD: any;
    let valueInSOL: any;
    let profitPercentage;
    let profitInUSD;
    let profitInSol;
    if (specificPosition && specificPosition.amountOut) {
      valueInUSD = (specificPosition.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, baseDecimals))) < 5 ? userTokenDetails.userTokenBalance * Number(tokenPriceUSD) : 'N/A';
      valueInSOL = (specificPosition.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, baseDecimals))) < 5 ? Number(((userTokenDetails.userTokenBalance)) * Number(tokenPriceSOL)) : 'N/A';
      initialInSOL = Number(specificPosition.amountIn) / 1e9;
      initialInUSD = initialInSOL * Number(solPrice);
      profitPercentage = valueInSOL != 'N/A' ? (Number(valueInSOL) - (Number(specificPosition.amountIn) / 1e9)) / (Number(specificPosition.amountIn) / 1e9) * 100 : 'N/A';
      profitInUSD = valueInUSD != 'N/A' ? Number(Number(userTokenDetails.userTokenBalance) * Number(tokenPriceUSD)) - initialInUSD : 'N/A';
      profitInSol = valueInSOL != 'N/A' ? (valueInSOL - initialInSOL).toFixed(4) : 'N/A';
    }
  
    const {
      birdeyeURL,
      dextoolsURL,
      dexscreenerURL,
      tokenData,
    } = tokenMetadataResult;
    const marketCap = birdeyeData?.response.data.data.mc ? birdeyeData.response.data.data.mc : tokenInfo.marketCap.toNumber() * Number(solPrice);
    try {
  
      const formattedmac = await formatNumberToKOrM(marketCap) ?? "NA";
  
      const priceImpact = tokenInfo.priceImpact.toFixed(2);
      const priceImpact_1 = tokenInfo.priceImpact_1.toFixed(2);
      const balanceInUSD = (balanceInSOL * (solPrice)).toFixed(2);
      // Construct the message
      let options: any;
      let messageText: any;
  
      if (
        ctx.session.latestCommand == 'buy'
        || ctx.session.latestCommand == 'buy_X_SOL'
      ) {
        ctx.session.currentMode = 'buy';
        messageText = `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
          `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
          `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
          `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
          `Market Cap: <b>${formattedmac} USD</b>\n` +
          `Token Price: <b> ${tokenPriceUSD.toFixed(9)} USD</b> | <b> ${tokenPriceSOL.toFixed(9)} SOL</b> \n\n` +
          `---<code>Trade Position</code>---\n` +
          `Initial : <b>${(initialInSOL).toFixed(4)} SOL</b> | <b>${(initialInUSD.toFixed(4))} USD</b>\n` +
          `Profit: ${profitInSol != 'N/A' ? Number(profitInSol).toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD != 'N/A' ? Number(profitInUSD).toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage != 'N/A' ? Number(profitPercentage).toFixed(2) : 'N/A'}%\n` +
          `Token Balance: <b>${userTokenBalance.toFixed(3)} $${userTokenSymbol} </b> | <b>${((userTokenBalance) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
          `Price Impact (5.0 SOL) : <b>${priceImpact}%</b>  |  (1.0 SOL): <b> ${priceImpact_1}%</b>\n\n` +
          `--<code>Priority fees</code>--\n Low: ${(Number(lowpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(mediumpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(highpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Max: ${(Number(maxpriorityFees) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
          `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n `;
  
  
  
        // Define buy mode inline keyboard
        options = {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: ' 🔂 Refresh ', callback_data: 'refresh_trade' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
              [{ text: 'Buy (X SOL)', callback_data: 'buy_X_SOL' }, { text: 'Buy (0.5 SOL)', callback_data: 'buy_0.5_SOL' }, { text: 'Buy (1 SOL)', callback_data: 'buy_1_SOL' }],
              // [{ text: '⏮️ Previous', callback_data: 'previous_token' }, { text: `${tokenData.name} (${tokenData.symbol})`, callback_data: 'current_token' }, { text: 'Next ⏭️', callback_data: 'next_token' }],
              [{ text: '📈 Priority fees', callback_data: '_' }],
              [
                { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Med ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },
                { text: `High ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_high' }, { text: `Max ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_max' }
              ],
              [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: 'Close', callback_data: 'closing' }]]
          },
        };
      } else if (ctx.session.latestCommand == 'sell'
        || ctx.session.latestCommand == 'sell_X_SOL'
      ) {
        ctx.session.currentMode = 'sell';
        messageText = `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
          `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
          `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
          `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
          `Market Cap: <b>${formattedmac} USD</b>\n` +
          `Token Price: <b> ${tokenPriceUSD.toFixed(9)} USD</b> | <b> ${tokenPriceSOL.toFixed(9)} SOL</b> \n\n` +
          `---<code>Trade Position</code>---\n` +
          `Initial : <b>${(initialInSOL).toFixed(3)} SOL</b> | <b>${(initialInUSD.toFixed(3))} USD</b>\n` +
          `Profit: ${profitInSol != 'N/A' ? Number(profitInSol).toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD != 'N/A' ? Number(profitInUSD).toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage != 'N/A' ? Number(profitPercentage).toFixed(2) : 'N/A'}%\n` +
          `Token Balance: <b>${userTokenBalance.toFixed(3)} $${userTokenSymbol} </b> | <b>${((userTokenBalance) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
          `Price Impact (5.0 SOL) : <b>${priceImpact}%</b>  |  (1.0 SOL): <b> ${priceImpact_1}%</b>\n\n` +
          `--<code>Priority fees</code>--\n Low: ${(Number(lowpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(mediumpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(highpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Max: ${(Number(maxpriorityFees) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
          `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n`;
  
        // Handle sell mode and define inline keyboard
        options = {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: ' 🔂 Refresh ', callback_data: 'refresh_trade' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
              [{ text: '  Sell 25%  ', callback_data: 'sell_25_TOKEN' }, { text: '  Sell 50%  ', callback_data: 'sell_50_TOKEN' }, { text: 'Sell 75%', callback_data: '  sell_75_TOKEN  ' },],
              [{ text: '  Sell 100%  ', callback_data: 'sell_100_TOKEN' }, { text: '  Sell X Amount  ', callback_data: 'sell_X_TOKEN' }],
              [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: ' Buy Mode', callback_data: 'buy' }],
              [{ text: '📈 Priority fees', callback_data: '_' }],
              [
                { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Med ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },
                { text: `High ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_high' }, { text: `Max ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_max' }
              ],
              [{ text: 'Close', callback_data: 'closing' }]
            ],
          },
        };
      }
      // let prevMessageID = Number(ctx.ctx.msg.message_id) -1;
      console.log('messageid', ctx.msg.message_id)
      console.log('ctx.session.latestCommand: ', ctx.session.latestCommand)
      console.log('messageText: \n', messageText)
      // Send or edit the message
      if (isRefresh) {
        await ctx.editMessageText(messageText, options);
      } else {
        await ctx.api.sendMessage(chatId, messageText, options);
      }
    } catch (error: any) {
      console.error('Error in display_token_details:', error);
      console.error('Error in getTokenMetadata:', error.message);
      // ctx.api.sendMessage(chatId, "Error getting token data, verify the address..", { parse_mode: 'HTML' });
    }
  }