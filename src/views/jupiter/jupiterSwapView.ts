
import { PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getUserTokenBalanceAndDetails } from '../../service/feeds';
import { quoteToken } from '../util/dataCalculation';
import { getSolanaDetails } from '../..//api';
import { formatNumberToKOrM, getSolBalance, getSwapAmountOutPump } from '../../service/util';
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
import BigNumber from 'bignumber.js';
import axios from 'axios';


export async function jupiterSwap(ctx:any){
    const chatId = ctx.chat.id;
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
    const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
   
    const payerKeypair = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[activeWalletIndexIdx].secretKey));
   
    const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];

    console.log('upSwap.amount', ctx.session.jupSwap_amount)
    const isBuySide = ctx.session.jupSwap_side == "buy";
    const tokenIn = isBuySide ? SOL_ADDRESS : ctx.session.jupSwap_token;
    const tokenOut = isBuySide ? ctx.session.jupSwap_token : SOL_ADDRESS;
    const userTokenBalanceAndDetails = isBuySide ?  await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection): await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenIn), connection);
    console.log('userTokenBalanceAndDetails:', userTokenBalanceAndDetails);

    const amountToSell = Math.floor((ctx.session.jupSwap_amount /100) * userTokenBalanceAndDetails.userTokenBalance * Math.pow(10, userTokenBalanceAndDetails.decimals));

    const amountIn = isBuySide ? ctx.session.jupSwap_amount * 1e9 : amountToSell;
   
   
    const refObject = { referralWallet: ctx.session.referralWallet, referralCommision: ctx.referralCommision};
   
    await ctx.api.sendMessage(chatId, `🟢 <b>Transaction ${ctx.session.jupSwap_side.toUpperCase()}:</b> Processing ... Please wait for confirmation...`, { parse_mode: 'HTML', disable_web_page_preview: true });
    jupiterSimpleSwap(
        connection,
        rpcUrl,
        payerKeypair,
        isBuySide,
        tokenIn,
        tokenOut,
        amountIn,
        500,
        ctx.session.priorityFees,
        refObject
      ).then(async(txSig) => {
        console.log('txSigs:', txSig)
        // let msg = `🟢 <b>Transaction ${tradeSide.toUpperCase()}:</b> Processing ... <a href="https://solscan.io/tx/${txSig}">View on Solscan</a>. Please wait for confirmation...`
        const tradeType = isBuySide ? 'buy' : 'sell';

        if(txSig){
          let tokenAmount,confirmedMsg;
          let solFromSell = 0;


          const _symbol = userTokenBalanceAndDetails.userTokenSymbol;
          let extractAmount =  await getSwapAmountOutPump(connection, [txSig.toString()], tradeType) 
          const amountFormatted = Number(extractAmount / Math.pow(10, userTokenBalanceAndDetails.decimals)).toFixed(4);
          tradeType == 'buy' ? tokenAmount = extractAmount : solFromSell = extractAmount;
          confirmedMsg = `✅ <b>${tradeType.toUpperCase()} tx confirmed</b> ${tradeType == 'buy' ? `You bought <b>${amountFormatted}</b> <b>${_symbol}</b> for <b>${ctx.session.jupSwap_amount} SOL</b>` : `You sold <b>${amountToSell/Math.pow(10,userTokenBalanceAndDetails.decimals)}</b> <b>${_symbol}</b> and received <b>${(solFromSell/1e9).toFixed(4)} SOL</b>`}. <a href="https://solscan.io/tx/${txSig}">View Details</a>.`;

          await ctx.api.sendMessage(chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
        }else{
          await ctx.api.sendMessage(chatId, `❌ ${tradeType.toUpperCase()} tx failed. Please try again later.`, { parse_mode: 'HTML', disable_web_page_preview: true });
        }
      });
}


export async function display_jupSwapDetails(ctx: any, isRefresh: boolean) {
  try {
    const chatId = ctx.chat.id;
    const session = ctx.session;
    const token = session.jupSwap_token 
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
      const [
        birdeyeData,
        tokenMetadataResult,
        getSolBalanceData
   
      ] = await Promise.all([
        getTokenDataFromBirdEye(token),
        getTokenMetadata(ctx, token),
        getSolBalance(publicKeyString, connection),
        
      ]);

     
      const {
        tokenData,
      } = tokenMetadataResult;
      const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.data.value : 0;
      // const tokenPriceUSD = birdeyeData

      // && birdeyeData.response
      // && birdeyeData.response.data
      // && birdeyeData.response.data.data
      // && birdeyeData.response.data.data.price != null  // This checks for both null and undefined
      // ? birdeyeData.response.data.data.price
      // : tokenInfo.price.times(solPrice).toNumber();
      // console.log('birdeyeData:', birdeyeData)
      console.log('solPrice:', solPrice)
      const baseDecimals = tokenData.mint.decimals;
      const totalSupply = new BigNumber(tokenData.mint.supply.basisPoints);
      // const Mcap = await formatNumberToKOrM(Number(totalSupply.dividedBy(Math.pow(10, baseDecimals)).times(swapRates)) * solPrice);
      
      let messageText = `<b>------ ${tokenData.name}(${tokenData.symbol}) ------</b>\n` +
        // ` <a href="${pumpFunLink}">Pump fun</a>\n`+
        `Contract: <code>${token}</code>\n`+
        // `Market Cap: <b>${Mcap}</b> USD\n` +
        // `Price:  <b>${swapRates.toFixed(9)} SOL</b> | <b>${(swapRates * solPrice).toFixed(9)} USD</b>\n\n` +
        `Wallet balance: <b>${getSolBalanceData.toFixed(4)}</b> SOL | <b>${(getSolBalanceData * Number(solPrice)).toFixed(4)}</b> USD\n\n` ;

      let options: any;
      options = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: ' 🔂 Refresh ', callback_data: 'refresh_Jupiter_swap' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
            [{ text: `Buy X  ${tokenMetadataResult.tokenData.symbol}`, callback_data: 'buy_X_JUP' }, { text: `Sell X ${tokenMetadataResult.tokenData.symbol}`, callback_data: 'sell_X_JUP' }],
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