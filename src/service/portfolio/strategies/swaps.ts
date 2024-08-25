import { Percent, TokenAmount, TOKEN_PROGRAM_ID, Token as RayddiumToken } from '@raydium-io/raydium-sdk';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import {updatePositions, getSolBalance, updateReferralBalance, getSwapAmountOut } from '../../util';
import { DEFAULT_TOKEN, MVXBOT_FEES,CONNECTION } from '../../../config';
import { getuserShitBalance, getUserTokenBalanceAndDetails } from '../../feeds';
import { raydium_amm_swap } from '../../dex';
import BigNumber from 'bignumber.js';
import bs58 from 'bs58';
import { display_jupSwapDetails } from '../../../views/jupiter/swapView';
import { createTradeImage } from '../../../views/util/image';
import { InputFile } from 'grammy';
import { raydium_amm_swap_v4 } from '../../../service/dex/raydium/amm/ammv4';
import { AmmRpcData, AmmV4Keys } from '@raydium-io/raydium-sdk-v2';
const fs = require('fs');

export async function handle_radyum_swap(
  ctx: any, 
  side: 'buy' | 'sell', 
  amountIn: any
) {

  const connection = CONNECTION;
  const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];

  try {
    let userSolBalance = await getSolBalance(userWallet.publicKey, connection);
    let tokenIn: any, outputToken: any;
    const tokenOut =   ctx.session.AmmPoolKeys.mintA.address;
    const AmmPoolId = ctx.session.AmmPoolKeys.id;
    const userTokenBalanceAndDetails = await getuserShitBalance(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection);
    let userTokenBalance = Number(userTokenBalanceAndDetails.userTokenBalance);
    let tokenDecimal = Number(ctx.session.AmmPoolKeys.mintA.decimals);
    /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
    /*                         BUY                                */
    /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
    if (side == 'buy') {
      amountIn = amountIn * Math.pow(10, 9); // lamports

      if ((userSolBalance * 1e9) < (amountIn + (amountIn * MVXBOT_FEES.toNumber()) + (ctx.session.customPriorityFee * 1e9))) {
        await ctx.api.sendMessage(ctx.session.chatId, `🔴 Insufficient balance. Your balance is ${userSolBalance} SOL`);
        return;
      }
      tokenIn = DEFAULT_TOKEN.WSOL;
      outputToken = tokenOut;

      /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
      /*                        SELL                                */
      /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
    } else if (side == 'sell') {

      // balance and fees are in SOL dont change to lamports
      if (userSolBalance < ctx.session.customPriorityFee) {
        await ctx.api.sendMessage(ctx.session.chatId, `🔴 Insufficient balance for transaction fees.`); return;
      }
      // amountIn is in percentage to sell = 50%, 30% etc 
      const amountToSell = Math.floor((amountIn/ 100) * userTokenBalance * Math.pow(10, tokenDecimal));
      console.log("amountToSell:: ",amountToSell);

      if ( amountToSell <= 0) {
        await ctx.api.sendMessage(ctx.session.chatId, `❌ You do not have enough ${ctx.session.AmmPoolKeys.mintA.symbol} to sell.`, { parse_mode: 'HTML', disable_web_page_preview: true });
        return;
      }
      tokenIn = tokenOut;
      outputToken = DEFAULT_TOKEN.WSOL;
      amountIn = amountToSell;
    }
    /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
    /*                         SWAP                               */
    /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
    const ammPoolKeys: AmmV4Keys | undefined =    ctx.session.AmmPoolKeys;
    const rpcData: AmmRpcData = ctx.session.AmmRpcData;
    // const inputTokenAmount = new TokenAmount(tokenIn!, new BigNumber(amountIn).toFixed());
    const slippage = Math.ceil(ctx.session.latestSlippage * 100/ 10_000);
    const customPriorityFee = ctx.session.customPriorityFee;
    console.log("customPriorityFee before swap:: ", customPriorityFee);
    let msg = `🟢 <b>Transaction ${side.toUpperCase()}:</b> Processing...\n Please wait for confirmation.`
    await ctx.api.sendMessage(ctx.session.chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
    // console.log("Debuggin herreee::::: ");
    raydium_amm_swap_v4({
      connection,
      side,
      AmmPoolId,
      ammPoolKeys,
      rpcData,
      outputToken,
      amountIn,
      slippage,
      customPriorityFee,
      wallet: Keypair.fromSecretKey(bs58.decode(String(userWallet.secretKey))),
    }).then(async (txids) => {
      if (!txids) return;
      console.log("txids:: ", txids);
      let extractAmount = await getSwapAmountOut(connection, txids);
      let confirmedMsg, solAmount, tokenAmount, _symbol = ctx.session.AmmPoolKeys.mintA.symbol;
      let solFromSell = new BigNumber(0);

      if (extractAmount > 0) {
        solFromSell = new BigNumber(extractAmount);
        solAmount = Number(extractAmount) / 1e9; // Convert amount to SOL
        tokenAmount = amountIn / Math.pow(10, userTokenBalanceAndDetails.decimals);
        side == 'sell' ?
          confirmedMsg = `✅ <b>${side.toUpperCase()} tx Confirmed:</b> You sold ${(amountIn/Math.pow(10,tokenDecimal)).toFixed(3)} <b>${_symbol}</b> for ${solAmount.toFixed(3)} <b>SOL</b>. <a href="https://solscan.io/tx/${txids}">View Details</a>.`
          : confirmedMsg = `✅ <b>${side.toUpperCase()} tx Confirmed:</b> You bought ${Number(extractAmount / Math.pow(10, tokenDecimal)).toFixed(3)} <b>${_symbol}</b> for ${(amountIn / 1e9).toFixed(4)} <b>SOL</b>. <a href="https://solscan.io/tx/${txids}">View Details</a>.`;
      } else {
        confirmedMsg = `✅ <b>${side.toUpperCase()} tx Confirmed:</b> Your transaction has been successfully confirmed. <a href="https://solscan.io/tx/${txids}">View Details</a>.`;
      }

      // update referral DB record
      const amountToUse = side == 'buy' ? amountIn : solFromSell;
      updateReferralBalance(ctx.session.chaidId, new BigNumber(amountToUse), ctx.session.referralCommision);
      console.log('amountIn:: ', amountIn);
      updatePositions(
        ctx.session.chatId,
        userWallet,
        side,
        'ray_swap', // tradeType
        ctx.session.AmmPoolKeys.mintB.address,
        ctx.session.AmmPoolKeys.mintA.address,
        ctx.session.AmmPoolKeys.mintA.name,
       _symbol,
        amountIn,
        extractAmount,
      );

      await ctx.api.sendMessage(ctx.session.chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
      if(side == 'sell' && ctx.session.pnlcard){
        await createTradeImage(_symbol,  ctx.session.AmmPoolKeys.mintA.address, ctx.session.userProfit).then((buffer) => {
          // Save the image buffer to a file
          
          fs.writeFileSync('trade.png', buffer);
          console.log('Image created successfully');
        });
        await ctx.replyWithPhoto(new InputFile('trade.png' ));
      }
      if (side == 'buy') {
        ctx.session.latestCommand = 'jupiter_swap';
        ctx.session.jupSwap_token = ctx.session.AmmPoolKeys.mintA.address;
        await display_jupSwapDetails(ctx, false);
      } else{
        ctx.session.latestCommand = 'jupiter_swap';
      }

    }).catch(async (error: any) => {
      await ctx.api.sendMessage(ctx.session.chatId, JSON.stringify(error.message));
      return;
    });
  } catch (e: any) {
    await ctx.api.sendMessage(ctx.session.chatId, `🔴 ${side.toUpperCase()} ${e.message}`);
    console.error("ERROR on handle_radyum_trade: ", e);
    return;
  }

}