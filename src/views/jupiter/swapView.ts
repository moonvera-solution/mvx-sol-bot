
import { PublicKey } from '@solana/web3.js';
import {  getTokenMetadata, getuserShitBalance, getUserTokenBalanceAndDetails } from '../../service/feeds';

import { formatNumberToKOrM, getSolBalance, getSwapAmountOutPump } from '../../service/util';
import { Keypair, Connection } from '@solana/web3.js';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { UserPositions } from '../../db';
import { getSolanaDetails, memeTokenPrice } from '../../api/priceFeeds/birdEye';
import {  SOL_ADDRESS } from "../../config";
import { jupiter_inx_swap } from '../../service/dex/jupiter/trade/swaps';
import bs58 from 'bs58';
import BigNumber from 'bignumber.js';
import { saveUserPosition } from "../../service/portfolio/positions";



import { createTradeImage } from '../util/image';
import { InputFile } from 'grammy';
import axios from 'axios';
import { sol } from '@metaplex-foundation/js';
const fs = require('fs');


export async function jupiterSwap(ctx: any) {
  const chatId = ctx.chat.id;
  const connection = new Connection(`${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`);
  const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`

  const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;


  const payerKeypair =  Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[activeWalletIndexIdx].secretKey));


  const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
  const isBuySide = ctx.session.jupSwap_side == "buy";
  const tokenIn = isBuySide ? SOL_ADDRESS : ctx.session.jupSwap_token;
  const tokenOut = isBuySide ? ctx.session.jupSwap_token : SOL_ADDRESS;

  const userTokenBalanceAndDetails = isBuySide ? await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection) : await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenIn), connection);
  // console.log('userTokenBalanceAndDetails::::::', userTokenBalanceAndDetails)
  const amountToSell = Math.floor((ctx.session.jupSwap_amount / 100) * userTokenBalanceAndDetails.userTokenBalance * Math.pow(10, userTokenBalanceAndDetails.decimals));
  const amountIn = isBuySide ? ctx.session.jupSwap_amount * 1e9 : amountToSell;

  if (!isBuySide && amountToSell <= 0) {
    await ctx.api.sendMessage(chatId, `❌ You do not have enough ${userTokenBalanceAndDetails.userTokenSymbol} to sell.`, { parse_mode: 'HTML', disable_web_page_preview: true });
    return;
  }

  await ctx.api.sendMessage(chatId, `🟢 <b>Transaction ${ctx.session.jupSwap_side.toUpperCase()}:</b> Processing... \n Please wait for confirmation.`, { parse_mode: 'HTML', disable_web_page_preview: true });

  jupiter_inx_swap(
    ctx,
    connection,
    rpcUrl,
    payerKeypair,
    tokenIn,
    tokenOut,
    amountIn,
    (ctx.session.latestSlippage * 100),
    (ctx.session.customPriorityFee * 1e9), // here is it for jupiter its allways the default set by users
    ctx.session.mevProtection,
    ctx.session.mevProtectionAmount * 1e9,
  ).then(async (txSig: any) => {
    if (!txSig) return;
    const tradeType = isBuySide ? 'buy' : 'sell';

    if (txSig) {
      const config = {
        searchTransactionHistory: true
      };
      const sigStatus = await connection.getSignatureStatus(txSig, config)
      if (sigStatus?.value?.err) {
        await ctx.api.sendMessage(chatId, `❌ ${tradeType.toUpperCase()} tx failed. Please try again.`, { parse_mode: 'HTML', disable_web_page_preview: true });
        return;
      }
      let tokenAmount, confirmedMsg;
      let solFromSell = 0;
      const _symbol = userTokenBalanceAndDetails.userTokenSymbol;
      let extractAmount = await getSwapAmountOutPump(connection, txSig, tradeType)
      const amountFormatted = Number(extractAmount / Math.pow(10, userTokenBalanceAndDetails.decimals)).toFixed(4);
      tradeType == 'buy' ? tokenAmount = extractAmount : solFromSell = extractAmount;
      confirmedMsg = `✅ <b>${tradeType.toUpperCase()} tx confirmed</b> ${tradeType == 'buy' ? `You bought <b>${amountFormatted}</b> <b>${_symbol}</b> for <b>${ctx.session.jupSwap_amount} SOL</b>` : `You sold <b>${amountToSell / Math.pow(10, userTokenBalanceAndDetails.decimals)}</b> <b>${_symbol}</b> and received <b>${(solFromSell / 1e9).toFixed(4)} SOL</b>`}. <a href="https://solscan.io/tx/${txSig}">View Details</a>.`;
      UserPositions.collection.listIndexes().toArray().then((indexes: any) => {
        if (indexes.some((index: any) => index.name === 'positionChatId_1')) {
          console.log('Index already exists');
          UserPositions.collection.dropIndex('positionChatId_1').catch((e: any) => console.error(e));
        }
      });      const userPosition = await UserPositions.findOne({  walletId: userWallet.publicKey.toString() });
      let oldPositionSol: number = 0;
      let oldPositionToken: number = 0;
      // console.log('userPosition', userPosition);
      // console.log('tokenIn', tokenIn);
      if (userPosition) {

        const existingPositionIndex = userPosition.positions.findIndex(
          position => position.baseMint === (isBuySide ? tokenOut.toString() : tokenIn.toString())
        );

        // console.log('existingPositionIndex', existingPositionIndex);
        if (userPosition.positions[existingPositionIndex]) {
          oldPositionSol = userPosition.positions[existingPositionIndex].amountIn
          oldPositionToken = userPosition.positions[existingPositionIndex].amountOut!
        }
      }

      if (tradeType == 'buy') {
        // console.log('extractAmount:', extractAmount)
        saveUserPosition(
          userWallet.publicKey.toString(), {
          baseMint: tokenOut,
          name: userTokenBalanceAndDetails.userTokenName,
          symbol: _symbol,
          // tradeType: `jup_swap`,
          amountIn: oldPositionSol ? oldPositionSol + (ctx.session.jupSwap_amount * 1e9) : (ctx.session.jupSwap_amount * 1e9),
          amountOut: oldPositionToken ? oldPositionToken + Number(extractAmount) : Number(extractAmount),
        });
      } else if (tradeType == 'sell') {
        let newAmountIn, newAmountOut;

        if (Number(amountIn) === oldPositionToken) {
          newAmountOut = 0;
        } else {
          newAmountOut = oldPositionToken > 0 ? oldPositionToken - Number(amountIn) : oldPositionToken;
        }
        if (oldPositionSol <= extractAmount) {
          newAmountIn = 0;
        } else {
          newAmountIn = oldPositionSol > 0 ? oldPositionSol - extractAmount : oldPositionSol;
        }
        

        if (extractAmount <0 || newAmountOut <= 0) {
          // newAmountIn = newAmountIn <= 0 ? 0 : newAmountIn;
          // newAmountOut = newAmountOut <= 0 ? 0 : newAmountOut;
          await UserPositions.updateOne({ walletId: userWallet.publicKey.toString() }, { $pull: { positions: { baseMint: tokenIn } } });
       

        } else {
          saveUserPosition(
            userWallet.publicKey.toString(), {
            baseMint: tokenIn,
            name: userTokenBalanceAndDetails.userTokenName,
            symbol: _symbol,
            // tradeType: `jup_swap`,
            amountIn: newAmountIn,
            amountOut: newAmountOut,
          });
        }
    
        if(!ctx.session.autoBuy){
        ctx.session.latestCommand = 'jupiter_swap'
        }
      }
      await ctx.api.sendMessage(chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });

      // if(tradeType == 'sell' && ctx.session.pnlcard ){
      //   const userShitbalance =   isBuySide ? await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection) : await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenIn), connection);
      //   if(userShitbalance.userTokenBalance == 0){
      //   await createTradeImage(_symbol, tokenIn, ctx.session.userProfit).then((buffer) => {
      //     // Save the image buffer to a file
      //     fs.writeFileSync('trade.png', buffer);
      //     console.log('Image created successfully');
      //   });
      //   await ctx.replyWithPhoto(new InputFile('trade.png' ));
      // }
      // }
      if (tradeType == 'buy' && !ctx.session.autoBuy) {
        ctx.session.latestCommand = 'jupiter_swap';
        await display_jupSwapDetails(ctx, false);
      }

    } else {
      await ctx.api.sendMessage(chatId, `❌ ${tradeType.toUpperCase()} tx failed. Please try again.`, { parse_mode: 'HTML', disable_web_page_preview: true });
    }
  }).catch(async (error: any) => {
    await ctx.api.sendMessage(chatId, error.message, { parse_mode: 'HTML', disable_web_page_preview: true });
  });
};

export async function display_jupSwapDetails(ctx: any, isRefresh: boolean) {
  try {
    const chatId = ctx.chat.id;
    const session = ctx.session;
    const token = session.jupSwap_token
    const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
    let swapUrlSol = `${rpcUrl}/jupiter/quote?inputMint=${'So11111111111111111111111111111111111111112'}&outputMint=${'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'}&amount=${1000000000}&slippageBps=${0}`.trim();

    let userWallet: any;
    if (ctx.session.portfolio) {
      const selectedWallet = ctx.session.portfolio.activeWalletIndex;
      userWallet = ctx.session.portfolio.wallets[selectedWallet];
    }

    const publicKeyString: any = userWallet.publicKey;
    if (token) {
      const birdeyeURL = `https://birdeye.so/token/${token}?chain=solana`;
      const dextoolsURL = `https://www.dextools.io/app/solana/pair-explorer/${token}`;
      const dexscreenerURL = `https://dexscreener.com/solana/${token}`;
      const connection = new Connection(rpcUrl);
      // check if the token is tradable on jupiter

      const headers = { 'x-api-key': `${process.env.SOL_TRACKER_API_DATA_KEY}` };
      const urlTrack = `https://data.solanatracker.io/price?token=${SOL_ADDRESS}`;
      const urlTrackToken = `https://data.solanatracker.io/price?token=${token}`;
      const timeout = (ms: any) =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), ms)
        );
      const [
        shitBalance,
        tokenMetadataResult,
        getSolBalanceData,
        userPosition,
        SolPriceTrack,
        // solTrackerData,
        birdTemp
      ] = await Promise.all([
        getuserShitBalance(publicKeyString,token, connection),
        getTokenMetadata(ctx, token),
        getSolBalance(publicKeyString, connection),
        UserPositions.find({ walletId: publicKeyString }, { positions: { $slice: -15 } }),
        fetch(urlTrack,{headers}).then((response) => response.json()),
        // fetch(urlTrackToken,{headers}).then((response) => response.json()),
        Promise.race([
          memeTokenPrice(token).then((data) => data),
          timeout(5000) //  500ms
        ]).catch((err) => {
          console.warn('birdTemp call skipped:', err.message);
          return null; 
        })      
      
      ]);
      let tokenPrice ;
      if(birdTemp != undefined && birdTemp != null && birdTemp != 0){
        tokenPrice = birdTemp;
      } else {
        await fetch(urlTrackToken,{headers}).then((response) => response.json()).then((data) => {
          tokenPrice = data.price;
        });
      }
      // if(tokenPrice == 0 || tokenPrice == undefined){
      //   await fetch(`https://api.jup.ag/price/v2?ids=${token}&showExtraInfo=true`).then((response) => response.json()).then((data) => {
      //     console.log('bckup jup pricing')
      //     tokenPrice = data.data[token].price;
      //   });
      // }
      const {
        tokenData,
      } = tokenMetadataResult;
      let solPrice = 0 ;
      if(SolPriceTrack &&  (SolPriceTrack.error == null || SolPriceTrack.error == undefined) && SolPriceTrack.price != null){
        solPrice = Number(SolPriceTrack.price);
      } else {
        await getSolanaDetails().then((data) => {
          solPrice = data;
        });
      }
  
      const tokenPriceUSD =  Number(tokenPrice) ;
      const tokenPriceSOL = tokenPriceUSD / solPrice;
      const baseDecimals = shitBalance?.decimals;
      const totalSupply = new BigNumber(shitBalance.shitSupply);
      const Mcap = await formatNumberToKOrM(Number(totalSupply.dividedBy(Math.pow(10, baseDecimals)).times(tokenPriceUSD)));
      // console.log('mcapsol', solTrackerData.marketCap);

      let specificPosition;
  
      if (userPosition[0] && userPosition[0].positions && userPosition[0].positions != undefined) {
        specificPosition = userPosition[0].positions.find((pos: any) => (pos.baseMint) === (token));
      }
      let initialInUSD = 0;
      let initialInSOL = 0;
      let valueInUSD: any;
      let valueInSOL: any;
      let profitPercentage;
      let profitInUSD;
      let profitInSol;
      if (specificPosition && specificPosition.amountOut) {
        valueInUSD = specificPosition.amountOut ? (specificPosition.amountOut / Math.pow(10,baseDecimals)) * Number(tokenPriceUSD) : NaN;
        valueInSOL = specificPosition.amountOut ? (specificPosition.amountOut / Math.pow(10,baseDecimals)) * Number(tokenPriceSOL) : NaN;
        initialInSOL = Number(specificPosition.amountIn) / 1e9;
        initialInUSD = initialInSOL * Number(solPrice);
        profitPercentage = valueInSOL ? (Number(valueInSOL) - (Number(specificPosition.amountIn) / 1e9)) / (Number(specificPosition.amountIn) / 1e9) * 100 : NaN;
        profitInUSD = valueInUSD  ? valueInUSD - initialInUSD : NaN;
        profitInSol = valueInSOL  ? valueInSOL - initialInSOL : NaN;
      }

      // ctx.session.userProfit = profitPercentage ? Number(profitPercentage) : 0;
      let messageText = `<b>------ ${tokenData.name}(${tokenData.symbol}) ------</b> | 📄 CA: <code>${token}</code> <a href="copy:${token}">🅲</a>\n` +
        `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
        `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
        `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
        // `<b>LP Burnt:</b> ${islpBurnt} | <b>Freezable:</b> ${freezable} \n\n` +   
        `---<code>Token Details</code>---\n` +
        `Market Cap: <b>${Mcap}</b> USD\n` +
        `Price:  <b>${tokenPriceSOL.toFixed(9)} SOL</b> | <b>${(tokenPriceUSD).toFixed(9)} USD</b> \n\n` +
        `---<code>Trade Position</code>---\n` +
        `Initial : <b>${(initialInSOL).toFixed(4)} SOL</b> | <b>${(initialInUSD.toFixed(4))} USD</b>\n` +
        `Profit: ${profitInSol  ? Number(profitInSol).toFixed(4) : NaN} <b>SOL</b> | ${profitInUSD  ? Number(profitInUSD).toFixed(4) : NaN} <b>USD</b> | ${profitPercentage  ? Number(profitPercentage).toFixed(2) : NaN}%\n` +
        `Token Balance: <b>${shitBalance.userTokenBalance.toFixed(4)} $${tokenData.symbol} </b> | <b>${((shitBalance.userTokenBalance) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((shitBalance.userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
        `Wallet balance: <b>${getSolBalanceData.toFixed(4)}</b> SOL | <b>${(getSolBalanceData * Number(solPrice)).toFixed(4)}</b> USD\n\n`;


      let options: any;
      options = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: ' 🔂 Refresh ', callback_data: 'refresh_Jupiter_swap' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
            [{ text: `Buy (X SOL)`, callback_data: 'buy_X_JUP' }, { text: `Buy (${ctx.session.key_buy_option_1} SOL)`, callback_data: 'buy_key_one_JUP' }, { text: `Buy (${ctx.session.key_buy_option_2} SOL)`, callback_data: 'buy_key_two_JUP' }],
            [{ text: `Sell X %`, callback_data: 'sell_X_JUP' }, { text: 'Sell 50%  ', callback_data: 'sell_50_JUP' }, { text: 'Sell 100%  ', callback_data: 'sell_100_JUP' }],
            [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: `Set priority ${ctx.session.customPriorityFee}`, callback_data: 'set_customPriority' }],
            [{ text: `📈 (${tokenData.symbol}) Live chart 📉`, url: `https://t.me/dribs_app_bot/dribs?startapp=${token}` }],
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
      ctx.api.sendMessage(chatId, "Token not found.");
    }

  } catch (e) {
    console.log(e);
  }
}