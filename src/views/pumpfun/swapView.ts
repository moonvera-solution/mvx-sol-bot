import {  PublicKey } from '@solana/web3.js';
import { getTokenMetadata, getuserShitBalance, getUserTokenBalanceAndDetails } from '../../service/feeds';

import { formatNumberToKOrM, getSolBalance, getSwapAmountOutPump, updatePositions } from '../../service/util';
import { Keypair } from '@solana/web3.js';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { getTokenDataFromBirdEyePositions } from '../../api/priceFeeds/birdEye';
import { getSwapDetails, pump_fun_swap } from '../../service/dex/pumpfun';
import { UserPositions } from '../../db/mongo/schema';
import { MVXBOT_FEES, SOL_ADDRESS,CONNECTION } from '../../config';
import bs58 from "bs58";
import BigNumber from 'bignumber.js';
import { saveUserPosition } from '../../service/portfolio/positions';
import { createTradeImage } from '../util/image';
import { InputFile } from 'grammy';
const fs = require('fs');


export async function swap_pump_fun(ctx: any) {
  try {
    const chatId = ctx.chat.id;
    const connection = CONNECTION;
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
    const payerKeypair = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[activeWalletIndexIdx].secretKey));
    const tradeSide = ctx.session.pump_side;
    const tokenIn = tradeSide == 'buy' ? SOL_ADDRESS : ctx.session.pumpToken;
    const tokenOut = tradeSide == 'buy' ? ctx.session.pumpToken : SOL_ADDRESS;
    const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
    const userTokenBalanceAndDetails = tradeSide == 'buy' ? await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection) : await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenIn), connection);
    
    const _symbol = userTokenBalanceAndDetails.userTokenSymbol;
    const amountToSell = (ctx.session.pump_amountIn / 100) * userTokenBalanceAndDetails.userTokenBalance;
    const userSolBalance = await getSolBalance(userWallet.publicKey, connection);
    const amountIn = tradeSide == 'buy' ? ctx.session.pump_amountIn : amountToSell;

    // console.log('amountIn:', amountIn);
    // console.log('tx.session.pump_amountIn:', ctx.session.pump_amountIn);
    if (tradeSide == 'buy' && userSolBalance < ctx.session.pump_amountIn) {
      await ctx.api.sendMessage(chatId, `❌ Insufficient SOL balance.`);
      return;
    }
    const finalAmountIn = tradeSide == 'buy' ? ctx.session.pump_amountIn : amountToSell;
    if(Number(finalAmountIn) <= 0) throw new Error('Not enough token balance');

    let msg = `🟢 <b>Transaction ${tradeSide.toUpperCase()}:</b> Processing... Please wait for confirmation.`
    await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
    
  
    await pump_fun_swap(connection, {
      side: tradeSide,
      from: tokenIn,
      to: tokenOut,
      amount: finalAmountIn,
      slippage: ctx.session.latestSlippage,
      payerKeypair: payerKeypair,
      referralWallet: new PublicKey(ctx.session.generatorWallet).toBase58(),
      referralCommision: ctx.session.referralCommision,
      priorityFee: ctx.session.customPriorityFee,
      forceLegacy: true,
      jitoObject: { useJito: ctx.session.useJito, jitoTip: ctx.session.jitoTip }
    }).then(async (txSigs) => {
      if (!txSigs) return;
      const config = {
        searchTransactionHistory: true
      };
      const sigStatus = await connection.getSignatureStatus(txSigs, config)
      if (sigStatus?.value?.err) {
        await ctx.api.sendMessage(chatId, `❌ ${tradeSide.toUpperCase()} tx failed. Please try again later.`, { parse_mode: 'HTML', disable_web_page_preview: true });
        return;
      }

      let confirmedMsg, tokenAmount
      let solFromSell = 0;

      let extractAmount = await getSwapAmountOutPump(connection, txSigs, tradeSide);
      const amountFormatted = Number(extractAmount / Math.pow(10, userTokenBalanceAndDetails.decimals)).toFixed(4);
      tradeSide == 'buy' ? tokenAmount = extractAmount : solFromSell = extractAmount;
      confirmedMsg = `✅ <b>${tradeSide.toUpperCase()} tx confirmed</b> ${tradeSide == 'buy' ? `You bought <b>${amountFormatted}</b> <b>${_symbol}</b> for <b>${ctx.session.pump_amountIn} SOL</b>` : `You sold <b>${amountToSell}</b> <b>${_symbol}</b> and received <b>${(solFromSell / 1e9).toFixed(4)} SOL</b>`}. <a href="https://solscan.io/tx/${txSigs}">View Details</a>.`;
      await ctx.api.sendMessage(chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });


      // ------- check user balanace in DB --------
      UserPositions.collection.dropIndex('positionChatId_1').catch((e: any) => console.error(e));
      const userPosition = await UserPositions.findOne({  walletId: userWallet.publicKey.toString() });
      // console.log("userPosition", userPosition);

      let oldPositionSol: number = 0;
      let oldPositionToken: number = 0;
      if (userPosition) {
        const existingPositionIndex = userPosition.positions.findIndex(
          position => position.baseMint === (tradeSide == 'buy' ? tokenOut.toString() : tokenIn.toString())
        );
        if (userPosition.positions[existingPositionIndex]) {
          oldPositionSol = userPosition.positions[existingPositionIndex].amountIn
          oldPositionToken = userPosition.positions[existingPositionIndex].amountOut!
        }
      }

      if (tradeSide == 'buy') {
         saveUserPosition( // to display portfolio positions
     
          userWallet.publicKey.toString(), {
          baseMint: ctx.session.pumpToken,
          name: userTokenBalanceAndDetails.userTokenName,
          symbol: _symbol,
          tradeType: `pump_swap`,
          amountIn: oldPositionSol ? oldPositionSol + ctx.session.pump_amountIn * 1e9 : ctx.session.pump_amountIn * 1e9,
          amountOut: oldPositionToken ? oldPositionToken + Number(extractAmount) : Number(extractAmount),
        });
        if(!ctx.session.autoBuy){
          ctx.session.latestCommand = 'jupiter_swap';
          await display_pumpFun(ctx, false);
        }
      } else {
        let newAmountIn, newAmountOut;

        if (Number(amountIn) === oldPositionToken || oldPositionSol <= extractAmount) {
          newAmountIn = 0;
          newAmountOut = 0;

        } else {
          newAmountIn = oldPositionSol > 0 ? oldPositionSol - extractAmount : oldPositionSol;
          newAmountOut = oldPositionToken > 0 ? oldPositionToken - Number(amountIn) : oldPositionToken;
      
        }

        if (newAmountIn <= 0 || newAmountOut <= 0) {
          await UserPositions.updateOne({ walletId: userWallet.publicKey.toString() }, { $pull: { positions: { baseMint: tokenIn } } });
        } else {
           saveUserPosition(
            userWallet.publicKey.toString(), {
            baseMint: tokenIn,
            name: userTokenBalanceAndDetails.userTokenName,
            symbol: _symbol,
            tradeType: `pump_swap`,
            amountIn: newAmountIn,
            amountOut: newAmountOut,
          });
        }
        if(!ctx.session.autoBuy){
        ctx.session.latestCommand = 'jupiter_swap'
        }
      }
      if(tradeSide == 'sell' && ctx.session.pnlcard ){
        const userShitbalance =  tradeSide == 'buy' ? await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection) : await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenIn), connection);
        if(userShitbalance.userTokenBalance == 0){
      await createTradeImage(_symbol,tokenIn, ctx.session.userProfit).then((buffer) => {
        // Save the image buffer to a file
        fs.writeFileSync('trade.png', buffer);
        console.log('Image created successfully');
      });
      await ctx.replyWithPhoto(new InputFile('trade.png' ));
    }

    }
      if (tradeSide == 'buy') {
        if(!ctx.session.autoBuy){
        ctx.session.latestCommand = 'jupiter_swap'
        }
      }
    });
  } catch (e:any) {
    await ctx.api.sendMessage(ctx.chat.id, `❌ Swap failed. Please try again.`, { parse_mode: 'HTML', disable_web_page_preview: true });
    console.error(e);
  }
}

export async function display_pumpFun(ctx: any, isRefresh: boolean) {
  console.log('display_pumpFun');
  try {
    const chatId = ctx.chat.id;
    const session = ctx.session;
    const solAddress = 'So11111111111111111111111111111111111111112'
    const token = session.pumpToken instanceof PublicKey ? session.pumpToken.toBase58() : session.pumpToken;
    let priority_Level = ctx.session.priorityFees;
    const priority_custom = ctx.session.ispriorityCustomFee;
    if (priority_custom === true) {
      priority_Level = 0;
    }

    let userWallet: any;
    if (ctx.session.portfolio) {
      const selectedWallet = ctx.session.portfolio.activeWalletIndex;
      userWallet = ctx.session.portfolio.wallets[selectedWallet];
    }
    const publicKeyString: any = userWallet.publicKey;
    if (token) {
      const connection = CONNECTION;
      const [
        birdeyeData,
        tokenMetadataResult,
        swapRates,
        getSolBalanceData,
        userTokenDetails,
        userPosition,
        jupSolPrice,
        shitBalance,
      ] = await Promise.all([
        getTokenDataFromBirdEyePositions(token, publicKeyString),
        getTokenMetadata(ctx, token),
        getSwapDetails(token, solAddress, 1, 0),
        getSolBalance(publicKeyString, connection),
        getUserTokenBalanceAndDetails(new PublicKey(publicKeyString), token, connection),
        UserPositions.find({  walletId: publicKeyString }, { positions: { $slice: -7 } }),
        fetch(
          `https://price.jup.ag/v6/price?ids=SOL`
        ).then((response) => response.json()),      
        getuserShitBalance(publicKeyString, token, connection),
      ]);

      // const mediumpriorityFees = (AllpriorityFees.result2);
      // const highpriorityFees = (AllpriorityFees.result3);
      // const maxpriorityFees = (AllpriorityFees.result4);

      const {
        tokenData,
      } = tokenMetadataResult;

      const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.value :  Number(jupSolPrice.data.SOL.price);
      const baseDecimals = tokenData.mint.decimals;
      const totalSupply = new BigNumber(tokenData.mint.supply.basisPoints);
      const Mcap = await formatNumberToKOrM(Number(totalSupply.dividedBy(Math.pow(10, baseDecimals)).times(swapRates)) * solPrice);
      const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;
      const netWorth = birdeyeData
        && birdeyeData.birdeyePosition
        && birdeyeData.birdeyePosition.data
        // && birdeyeData.birdeyePosition.data.data
        && birdeyeData.birdeyePosition.data.totalUsd
        ? birdeyeData.birdeyePosition.data.totalUsd : NaN;

      const netWorthSol = netWorth / solPrice;
      let specificPosition;
      // console.log('token:', token)  
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
        valueInUSD = (specificPosition.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, baseDecimals))) < 5 ? userTokenDetails.userTokenBalance * Number(swapRates * solPrice) : 'N/A';
        valueInSOL = (specificPosition.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, baseDecimals))) < 5 ? Number(((userTokenDetails.userTokenBalance)) * Number(swapRates)) : 'N/A';
        initialInSOL = Number(specificPosition.amountIn) / 1e9;
        initialInUSD = initialInSOL * Number(solPrice);
        profitPercentage = valueInSOL != 'N/A' ? (Number(valueInSOL) - (Number(specificPosition.amountIn + 25000) / 1e9)) / (Number(specificPosition.amountIn) / 1e9) * 100 : 'N/A';
        profitInUSD = valueInUSD != 'N/A' ? Number(Number(userTokenDetails.userTokenBalance) * Number(swapRates * solPrice)) - initialInUSD : 'N/A';
        profitInSol = valueInSOL != 'N/A' ? (valueInSOL - initialInSOL).toFixed(4) : 'N/A';
      }
      console.log('profitPercentage:', profitPercentage);
      ctx.session.userProfit = profitPercentage


      let messageText = `<b>------ ${tokenData.name}(${tokenData.symbol}) ------</b>\n` +
        `Contract: <code>${token}</code>\n` +
        `Market Cap: <b>${Mcap}</b> USD\n` +
        `Price:  <b>${new BigNumber(swapRates).toFixed(9)} SOL</b> | <b>${new BigNumber(swapRates * solPrice).toFixed(9)} USD</b>\n\n` +
        `---<code>Trade Position</code>---\n` +
        `Initial : <b>${(initialInSOL).toFixed(4)} SOL</b> | <b>${(initialInUSD.toFixed(4))} USD</b>\n` +
        `Profit: ${profitInSol != 'N/A' ? Number(profitInSol).toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD != 'N/A' ? Number(profitInUSD).toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage != 'N/A' ? Number(profitPercentage).toFixed(2) : 'N/A'}%\n` +
        `Token Balance: <b>${shitBalance.userTokenBalance.toFixed(4)}</b> ${tokenData.symbol} | <b>${((shitBalance.userTokenBalance.toFixed(4)) * Number(swapRates * solPrice)).toFixed(3)} USD </b> |  <b>${((shitBalance.userTokenBalance) * Number(swapRates)).toFixed(4)} SOL </b> \n\n` +
        // `--<code>Priority fees</code>--\n Low: ${(Number(mediumpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(highpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(maxpriorityFees) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
        `Wallet balance: <b>${getSolBalanceData.toFixed(4)}</b> SOL | <b>${(getSolBalanceData * solPrice).toFixed(4)}</b> USD\n` +
        `Net Worth: <b>${netWorthSol.toFixed(4)}</b> SOL | <b>${netWorth.toFixed(4)}</b> USD\n`;

      let options: any;
      options = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: ' 🔂 Refresh ', callback_data: 'refresh_pump_fun' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
            [{ text: `Buy X  (SOL)`, callback_data: 'buy_X_PUMP' }, { text: 'Buy (0.5 SOL)', callback_data: 'buy_0.5_PUMP' }, { text: 'Buy (1 SOL)', callback_data: 'buy_1_PUMP' }],
            [{ text: `Sell X %`, callback_data: 'sell_X_PUMP' }, { text: 'Sell 50%  ', callback_data: 'sell_50_PUMP' }, { text: 'Sell 100%  ', callback_data: 'sell_100_PUMP' }],
            [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: `set_slippage` }, { text: `Set priority ${ctx.session.customPriorityFee}`, callback_data: 'set_customPriority' }],
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
      ctx.api.sendMessage(chatId, "Token not found. Please try again.");
    }

  } catch (e) {
    console.log(e);
  }
}
