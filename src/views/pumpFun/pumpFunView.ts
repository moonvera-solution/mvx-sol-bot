import { PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getUserTokenBalanceAndDetails } from '../../service/feeds';
import { quoteToken } from '../util/dataCalculation';
import { getSolanaDetails } from '../../api';
import { formatNumberToKOrM, getPriorityFeeLabel, getSolBalance, getSwapAmountOut, getSwapAmountOutPump, waitForConfirmation, waitForConfirmationPump } from '../../service/util';
import { Keypair, Connection } from '@solana/web3.js';
import { runAllFees } from '../util/getPriority';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { logErrorToFile } from "../../../error/logger";
import { getTokenDataFromBirdEye } from '../../api/priceFeeds/birdEye';
import {SOL_TRACKER_SWAP_PARAMS, getSwapDetails, swap_solTracker} from '../../service/dex/solTracker';
import { Referrals } from '../../db/mongo/schema';
import {SOL_ADDRESS} from '../../../config';

import bs58 from "bs58";
import BigNumber from 'bignumber.js';
import { getMaxPrioritizationFeeByPercentile } from '../../service/fees/priorityFees';

export async function swap_pump_fun(ctx:any){
  try{
    const chatId = ctx.chat.id;
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
    const payerKeypair = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[activeWalletIndexIdx].secretKey));
    const tradeSide = ctx.session.pump_side;
    const tokenIn = tradeSide == 'buy' ? SOL_ADDRESS : ctx.session.pumpToken;
    const tokenOut = tradeSide == 'buy' ? ctx.session.pumpToken : SOL_ADDRESS;
    const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
    const userTokenBalanceAndDetails = tradeSide =='buy'?  await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection): await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenIn), connection);
    const _symbol = userTokenBalanceAndDetails.userTokenSymbol;
    const amountToSell = (ctx.session.pump_amountIn /100) * userTokenBalanceAndDetails.userTokenBalance  ;
    console.log('userTokenBalanceAndDetails:', userTokenBalanceAndDetails);
   await swap_solTracker(connection,{
        side: tradeSide,
        from: tokenIn,
        to :  tokenOut,
        amount : tradeSide == 'buy' ? ctx.session.pump_amountIn : amountToSell,
        slippage: ctx.session.latestSlippage,
        payerKeypair: payerKeypair,
        referralWallet: new PublicKey(ctx.session.generatorWallet).toBase58(),
        referralCommision: ctx.session.referralCommision,
        forceLegacy: true
    }).then(async (txSigs) => {  
        console.log('txSigs:', txSigs)
        let msg = `🟢 <b>Transaction ${tradeSide.toUpperCase()}:</b> Processing ... <a href="https://solscan.io/tx/${txSigs}">View on Solscan</a>. Please wait for confirmation...`
         await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
         const isConfirmed = await waitForConfirmationPump(ctx, txSigs.toString());
         let extractAmount = isConfirmed ? await getSwapAmountOutPump(connection, [txSigs.toString()], tradeSide) : 0;
         if(isConfirmed){
          
          let confirmedMsg, solAmount, tokenAmount
          let solFromSell = 0;
          if (extractAmount > 0) {
            const amountFormatted = Number(extractAmount / Math.pow(10, userTokenBalanceAndDetails.decimals)).toFixed(4);
            tradeSide == 'buy' ? tokenAmount = extractAmount : solFromSell = extractAmount;
            confirmedMsg = `✅ <b>${tradeSide.toUpperCase()} tx confirmed</b> ${tradeSide == 'buy' ? `You bought <b>${amountFormatted}</b> <b>${_symbol}</b> for <b>${ctx.session.pump_amountIn} SOL</b>` : `You sold <b>${amountToSell}</b> <b>${_symbol}</b> and received <b>${(solFromSell/1e9).toFixed(4)} SOL</b>`}. <a href="https://solscan.io/tx/${txSigs}">View Details</a>.`;
            await ctx.api.sendMessage(chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
           }else {
            confirmedMsg = `✅ <b>${tradeSide.toUpperCase()} tx Confirmed:</b> Your transaction has been successfully confirmed. <a href="https://solscan.io/tx/${txSigs}">View Details</a>.`;
            await ctx.api.sendMessage(chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
          }
         }else{
          await ctx.api.sendMessage(chatId, `❌ ${tradeSide.toUpperCase()} tx failed. Please try again later.`, { parse_mode: 'HTML', disable_web_page_preview: true });
         }
         console.log('extractAmount', extractAmount);
    });
  } catch (e) {
    await ctx.api.sendMessage(ctx.chat.id, `❌ Swap failed`);
    console.error(e);
  }
}

export async function display_pumpFun(ctx: any, isRefresh: boolean) {
    try {
      const chatId = ctx.chat.id;
      const session = ctx.session;
      const solAddress = 'So11111111111111111111111111111111111111112'
      const token = session.pumpToken instanceof PublicKey ? session.pumpToken.toBase58() : session.pumpToken;
      let priority_Level = ctx.session.priorityFees;
      const priority_custom = ctx.session.ispriorityCustomFee;
      if(priority_custom === true){
        priority_Level = 0;
      }

      let userWallet: any;
      if(ctx.session.portfolio){
          const selectedWallet = ctx.session.portfolio.activeWalletIndex;
          userWallet = ctx.session.portfolio.wallets[selectedWallet];
      }
      const publicKeyString: any = userWallet.publicKey; 
      if (token) {
        const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
        const pumpFunLink = `https://pump.fun/${token}`;
        const [
          solPriceData,
          tokenMetadataResult,
          swapRates,
          getSolBalanceData,
        ] = await Promise.all([
          getSolanaDetails(),
          getTokenMetadata(ctx, token),
          getSwapDetails(token,solAddress, 1, 0 ),
          getSolBalance(publicKeyString, connection),
        ]);

       
        const {
          tokenData,
        } = tokenMetadataResult;
        const solPrice = solPriceData ? solPriceData: 0;
        const baseDecimals = tokenData.mint.decimals;
        const totalSupply = new BigNumber(tokenData.mint.supply.basisPoints);
        const Mcap = await formatNumberToKOrM(Number(totalSupply.dividedBy(Math.pow(10, baseDecimals)).times(swapRates)) * solPrice);
        
        let messageText = `<b>------ ${tokenData.name}(${tokenData.symbol}) ------</b>\n` +
          `💊 <a href="${pumpFunLink}">Pump fun</a>\n`+
          `Contract: <code>${token}</code>\n`+
          `Market Cap: <b>${Mcap}</b> USD\n` +
          `Price:  <b>${swapRates.toFixed(9)} SOL</b> | <b>${(swapRates * solPrice).toFixed(9)} USD</b>\n\n` +
          `Wallet balance: <b>${getSolBalanceData.toFixed(4)}</b> SOL | <b>${(getSolBalanceData * solPrice).toFixed(4)}</b> USD\n\n` ;
  
        let options: any;
        options = {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: ' 🔂 Refresh ', callback_data: 'refresh_pump_fun' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
              [{ text: `Buy X  ${tokenMetadataResult.tokenData.symbol}`, callback_data: 'buy_X_PUMP' }, { text: `Sell X ${tokenMetadataResult.tokenData.symbol}`, callback_data: 'sell_X_PUMP' }],
            
              [{ text: 'Close', callback_data: 'closing' }]
            ]
          }
        };
        if (isRefresh) {
          await ctx.editMessageText(messageText, options);
        } else {
          await ctx.api.sendMessage(chatId, messageText, options);
        }
      } else {
        ctx.api.sendMessage(chatId, "Token not found. Please try again.");
      }
  
    } catch (e) {
      console.log(e);
    }
  }
