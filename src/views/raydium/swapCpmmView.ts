import { raydium_cpmm_swap } from "../../service/dex/raydium/cpmm/index";
import { PublicKey } from '@solana/web3.js';
import {  getUserTokenBalanceAndDetails } from '../../service/feeds';
import dotenv from "dotenv"; dotenv.config();
import {  getSwapAmountOutCpmm} from '../../service/util';
import { Keypair, Connection } from '@solana/web3.js';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { UserPositions } from '../../db/mongo/schema';
import {  SOL_ADDRESS } from '../../config';
import bs58 from "bs58";
import { saveUserPosition } from '../../service/portfolio/positions';
import { createTradeImage } from "../util/image";
import { InputFile } from "grammy";
import { display_jupSwapDetails } from "../jupiter/swapView";
const fs = require('fs');

export async function ray_cpmm_swap(ctx: any) {
  const chatId = ctx.chat.id;
  const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`;
  const connection = new Connection(rpcUrl);
  const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
  const payerKeypair = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[activeWalletIndexIdx].secretKey));
  const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
  const isBuySide =   ctx.session.cpmm_side == "buy";
  const tokenIn = isBuySide ? SOL_ADDRESS : ctx.session.jupSwap_token;
  const tokenOut = isBuySide ? ctx.session.jupSwap_token : SOL_ADDRESS;
  const userTokenBalanceAndDetails = isBuySide ? await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection) : await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenIn), connection);
  const amountToSell = Math.floor(( ctx.session.cpmm_amountIn  / 100) * userTokenBalanceAndDetails.userTokenBalance * Math.pow(10, userTokenBalanceAndDetails.decimals));
  const amountIn = isBuySide ?  ctx.session.cpmm_amountIn  * 1e9 : amountToSell;

 
  if (!isBuySide && amountToSell <= 0) {
    await ctx.api.sendMessage(chatId, `❌ You do not have enough ${userTokenBalanceAndDetails.userTokenSymbol} to sell.`, { parse_mode: 'HTML', disable_web_page_preview: true });
    return;
  }
  await ctx.api.sendMessage(chatId, `🟢 <b>Transaction ${  ctx.session.cpmm_side.toUpperCase()}:</b> Processing... \n Please wait for confirmation.`, { parse_mode: 'HTML', disable_web_page_preview: true });
  console.log('slippage', ctx.session.latestSlippage);
  raydium_cpmm_swap(
    connection,
    payerKeypair,
    ctx.session.cpmm_side,
    ctx.session.cpmmPoolId.id,
    amountIn,
    (ctx.session.latestSlippage + 10),
   ctx

  ).then(async (txid) => {
    if (!txid) return;
    const tradeType = isBuySide ? 'buy' : 'sell';
    console.log('raydium_cpmm_swap.......--c>: fntend');

    if (txid) {
      const config = {
        searchTransactionHistory: true
      };
      const sigStatus = await connection.getSignatureStatus(txid, config)
      if (sigStatus?.value?.err) {
        await ctx.api.sendMessage(chatId, `❌ ${tradeType.toUpperCase()} tx failed. Please try again.`, { parse_mode: 'HTML', disable_web_page_preview: true });
        return;
      }
      let tokenAmount, confirmedMsg;
      let solFromSell = 0;
      const _symbol = userTokenBalanceAndDetails.userTokenSymbol;
      let extractAmount = await getSwapAmountOutCpmm(connection, txid, tradeType)
      const amountFormatted = Number(extractAmount / Math.pow(10, userTokenBalanceAndDetails.decimals)).toFixed(4);
      tradeType == 'buy' ? tokenAmount = extractAmount : solFromSell = extractAmount;
      confirmedMsg = `✅ <b>${tradeType.toUpperCase()} tx confirmed</b> ${tradeType == 'buy' ? `You bought <b>${amountFormatted}</b> <b>${_symbol}</b> for <b>${amountIn / 1e9} SOL</b>` : `You sold <b>${Number(amountToSell / Math.pow(10, userTokenBalanceAndDetails.decimals)).toFixed(3)}</b> <b>${_symbol}</b> and received <b>${(ctx.session.CpmmSolExtracted / 1e9).toFixed(4)} SOL</b>`}. <a href="https://solscan.io/tx/${txid}">View Details</a>.`;
      UserPositions.collection.listIndexes().toArray().then((indexes: any) => {
        if (indexes.some((index: any) => index.name === 'positionChatId_1')) {
          console.log('Index already exists');
          UserPositions.collection.dropIndex('positionChatId_1').catch((e: any) => console.error(e));
        }
      });     
       const userPosition = await UserPositions.findOne({  walletId: userWallet.publicKey.toString() });
      let oldPositionSol: number = 0;
      let oldPositionToken: number = 0;
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
        saveUserPosition(
          userWallet.publicKey.toString(), {
          baseMint: tokenOut,
          name: userTokenBalanceAndDetails.userTokenName,
          symbol: _symbol,
          // tradeType: `cpmm_swap`,
          amountIn: oldPositionSol ? oldPositionSol + ( ctx.session.cpmm_amountIn  * 1e9) : ( ctx.session.cpmm_amountIn  * 1e9),
          amountOut: oldPositionToken ? oldPositionToken + Number(extractAmount) : Number(extractAmount),

        });
      } else if (tradeType == 'sell') {
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
          ctx.session.positionIndex = 0;
        } else {
          saveUserPosition(
            userWallet.publicKey.toString(), {
            baseMint: tokenIn,
            name: userTokenBalanceAndDetails.userTokenName,
            symbol: _symbol,
            // tradeType: `cpmm_swap`,
            amountIn: newAmountIn,
            amountOut: newAmountOut,
          });
        }
        if(!ctx.session.autoBuy){
        ctx.session.latestCommand = 'jupiter_swap'
        }
      }
      await ctx.api.sendMessage(chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
    //   if(tradeType == 'sell' && ctx.session.pnlcard){
    //     const userShitbalance = isBuySide ? await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection) : await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenIn), connection);
    //     if(userShitbalance.userTokenBalance == 0){
    //     await createTradeImage(_symbol, tokenIn, ctx.session.userProfit).then((buffer) => {
    //       // Save the image buffer to a file
    //       fs.writeFileSync('trade.png', buffer);
    //       console.log('Image created successfully');
    //     });
    //     await ctx.replyWithPhoto(new InputFile('trade.png' ));
    //   }
    // }
      if (tradeType == 'buy') {
       if (!ctx.session.autoBuy) {
        ctx.session.latestCommand = 'jupiter_swap';
        await display_jupSwapDetails(ctx, false);
        }
      
      }
    } else {
      await ctx.api.sendMessage(chatId, `❌ ${tradeType.toUpperCase()} tx failed. Please try again.`, { parse_mode: 'HTML', disable_web_page_preview: true });
    }
  }).catch(async (error: any) => {
    await ctx.api.sendMessage(chatId, error.message, { parse_mode: 'HTML', disable_web_page_preview: true });
  });
}

   