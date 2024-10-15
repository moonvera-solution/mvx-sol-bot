import {  PublicKey } from '@solana/web3.js';
import { getTokenMetadata, getuserShitBalance, getUserTokenBalanceAndDetails } from '../../service/feeds';

import { formatNumberToKOrM, getSolBalance, getSwapAmountOutPump, updatePositions } from '../../service/util';
import { Keypair } from '@solana/web3.js';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { getTokenDataFromBirdEyePositions } from '../../api/priceFeeds/birdEye';
import { getSwapDetails, soltracker_swap } from '../../service/dex/pumpfun';
import { UserPositions } from '../../db/mongo/schema';
import { MVXBOT_FEES, SOL_ADDRESS,CONNECTION } from '../../config';
import bs58 from "bs58";
import BigNumber from 'bignumber.js';
import { saveUserPosition } from '../../service/portfolio/positions';
import { createTradeImage } from '../util/image';
import { InputFile } from 'grammy';
import { display_jupSwapDetails } from '../jupiter/swapView';
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
    // console.log('amountToSell:', amountToSell);
    const userSolBalance = await getSolBalance(userWallet.publicKey, connection);
    const amountIn = tradeSide == 'buy' ? ctx.session.pump_amountIn : amountToSell;

    // console.log('amountIn:', amountIn);
    // console.log('tx.session.pump_amountIn:', ctx.session.pump_amountIn);
    if (tradeSide == 'buy' && userSolBalance < ctx.session.pump_amountIn) {
      await ctx.api.sendMessage(chatId, `❌ Insufficient SOL balance.`);
      return;
    }
    // console.log('amountIn:', amountIn);
    if(Number(amountIn) <= 0) throw new Error('Not enough token balance');

    let msg = `🟢 <b>Transaction ${tradeSide.toUpperCase()}:</b> Processing... Please wait for confirmation.`
    await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
    
  
    await soltracker_swap(ctx,connection, {
      side: tradeSide,
      from: tokenIn,
      to: tokenOut,
      amount: amountIn,
      slippage: `${ctx.session.latestSlippage + 5}`,
      payerKeypair: payerKeypair,
      priorityFee: (ctx.session.customPriorityFee ),
      forceLegacy: true
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
      UserPositions.collection.listIndexes().toArray().then((indexes: any) => {
        if (indexes.some((index: any) => index.name === 'positionChatId_1')) {
          console.log('Index already exists');
          UserPositions.collection.dropIndex('positionChatId_1').catch((e: any) => console.error(e));
        }
      });
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
          // tradeType: `pump_swap`,
          amountIn: oldPositionSol ? oldPositionSol + ctx.session.pump_amountIn * 1e9 : ctx.session.pump_amountIn * 1e9,
          amountOut: oldPositionToken ? oldPositionToken + Number(extractAmount) : Number(extractAmount),
        });
        if(!ctx.session.autobuy){
          ctx.session.latestCommand = 'jupiter_swap';
          await display_jupSwapDetails(ctx, false);
        }
      } else {
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

        if ( newAmountOut <= 0) {
          // newAmountIn = newAmountIn <= 0 ? 0 : newAmountIn;
          // newAmountOut = newAmountOut <= 0 ? 0 : newAmountOut;
          await UserPositions.updateOne({ walletId: userWallet.publicKey.toString() }, { $pull: { positions: { baseMint: tokenIn } } });
          // saveUserPosition(
          //   userWallet.publicKey.toString(), {
          //   baseMint: tokenIn,
          //   name: userTokenBalanceAndDetails.userTokenName,
          //   symbol: _symbol,
          //   // tradeType: `pump_swap`,
          //   amountIn: newAmountIn,
          //   amountOut: newAmountOut,
          // }
          // );
          ctx.session.positionIndex = 0;
     

        }  else {
           saveUserPosition(
            userWallet.publicKey.toString(), {
            baseMint: tokenIn,
            name: userTokenBalanceAndDetails.userTokenName,
            symbol: _symbol,
            // tradeType: `pump_swap`,
            amountIn: newAmountIn,
            amountOut: newAmountOut,
          });
        }
        if(!ctx.session.autobuy){
        ctx.session.latestCommand = 'jupiter_swap'
        }
      }
    //   if(tradeSide == 'sell' && ctx.session.pnlcard ){
    //     const userShitbalance =  tradeSide == 'buy' ? await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection) : await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenIn), connection);
    //     if(userShitbalance.userTokenBalance == 0){
    //   await createTradeImage(_symbol,tokenIn, ctx.session.userProfit).then((buffer) => {
    //     // Save the image buffer to a file
    //     fs.writeFileSync('trade.png', buffer);
    //     console.log('Image created successfully');
    //   });
    //   await ctx.replyWithPhoto(new InputFile('trade.png' ));
    // }

    // }
      if (tradeSide == 'buy') {
        if(!ctx.session.autobuy){
        ctx.session.latestCommand = 'jupiter_swap'
        }
      }
    });
  } catch (e:any) {
    await ctx.api.sendMessage(ctx.chat.id, `❌ Swap failed. Please try again.`, { parse_mode: 'HTML', disable_web_page_preview: true });
    console.error(e);
  }
}

