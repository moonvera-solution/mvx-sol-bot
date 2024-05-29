import { Percent, TokenAmount, TOKEN_PROGRAM_ID, Token as RayddiumToken } from '@raydium-io/raydium-sdk';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import {updatePositions, getSolBalance, updateReferralBalance, getSwapAmountOut } from '../../util';
import { DEFAULT_TOKEN, MVXBOT_FEES,CONNECTION } from '../../../config';
import { getUserTokenBalanceAndDetails } from '../../feeds';
import { raydium_amm_swap } from '../../dex';
import BigNumber from 'bignumber.js';
import bs58 from 'bs58';
import { display_jupSwapDetails } from '../../../views/jupiter/swapView';

export async function handle_radyum_swap(
  ctx: any, tokenOut: PublicKey,
  side: 'buy' | 'sell', amountIn: any
) {

  const connection = CONNECTION;
  const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];

  try {
    let userSolBalance = await getSolBalance(userWallet.publicKey, connection);
    let tokenIn: any, outputToken: any;
    const userTokenBalanceAndDetails = await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection);
    let userTokenBalance = userTokenBalanceAndDetails.userTokenBalance;
    const MEME_COIN = new RayddiumToken(TOKEN_PROGRAM_ID, tokenOut, userTokenBalanceAndDetails.decimals);

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
      outputToken = MEME_COIN;

      /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
      /*                        SELL                                */
      /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
    } else if (side == 'sell') {

      // balance and fees are in SOL dont change to lamports
      if (userSolBalance < ctx.session.customPriorityFee) {
        await ctx.api.sendMessage(ctx.session.chatId, `🔴 Insufficient balance for transaction fees.`); return;
      }

      let userBalanceInLamports = userTokenBalance * Math.pow(10, userTokenBalanceAndDetails.decimals);

      // amountIn is in percentage to sell = 50%, 30% etc 
      const amountToSell = new BigNumber(userBalanceInLamports).multipliedBy(amountIn).dividedBy(100).integerValue(BigNumber.ROUND_FLOOR);
      console.log("amountToSell:: ",amountToSell.toNumber());

      if (userTokenBalance == 0 || userBalanceInLamports < amountToSell.toNumber()) {
        await ctx.api.sendMessage(ctx.session.chatId, `🔴 Insufficient balance. Your balance is ${userTokenBalance} ${userTokenBalanceAndDetails.userTokenSymbol}.`);
        return;
      }

      tokenIn = MEME_COIN;
      outputToken = DEFAULT_TOKEN.WSOL;
      amountIn = amountToSell.toNumber();
    }
    /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
    /*                         SWAP                               */
    /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
    const poolKeys = ctx.session.activeTradingPool;
    const inputTokenAmount = new TokenAmount(tokenIn!, new BigNumber(amountIn).toFixed());
    const slippage = new Percent(Math.ceil(ctx.session.latestSlippage * 100), 10_000);
    const refObject = { referralWallet: ctx.session.generatorWallet, referralCommision: ctx.session.referralCommision };
    const customPriorityFee = ctx.session.customPriorityFee;

    let msg = `🟢 <b>Transaction ${side.toUpperCase()}:</b> Processing...\n Please wait for confirmation.`
    await ctx.api.sendMessage(ctx.session.chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
  
    raydium_amm_swap({
      connection,
      side,
      refObject,
      outputToken,
      targetPool: poolKeys.id, // ammId
      inputTokenAmount,
      slippage,
      customPriorityFee,
      wallet: Keypair.fromSecretKey(bs58.decode(String(userWallet.secretKey))),
    }).then(async (txids) => {
      if (!txids) return;

      let extractAmount = await getSwapAmountOut(connection, txids);
      let confirmedMsg, solAmount, tokenAmount, _symbol = userTokenBalanceAndDetails.userTokenSymbol;
      let solFromSell = new BigNumber(0);

      if (extractAmount > 0) {
        solFromSell = new BigNumber(extractAmount);
        solAmount = Number(extractAmount) / 1e9; // Convert amount to SOL
        tokenAmount = amountIn / Math.pow(10, userTokenBalanceAndDetails.decimals);
        side == 'sell' ?
          confirmedMsg = `✅ <b>${side.toUpperCase()} tx Confirmed:</b> You sold ${tokenAmount.toFixed(3)} <b>${_symbol}</b> for ${solAmount.toFixed(3)} <b>SOL</b>. <a href="https://solscan.io/tx/${txids}">View Details</a>.`
          : confirmedMsg = `✅ <b>${side.toUpperCase()} tx Confirmed:</b> You bought ${Number(extractAmount / Math.pow(10, userTokenBalanceAndDetails.decimals)).toFixed(4)} <b>${_symbol}</b> for ${(amountIn / 1e9).toFixed(4)} <b>SOL</b>. <a href="https://solscan.io/tx/${txids}">View Details</a>.`;
      } else {
        confirmedMsg = `✅ <b>${side.toUpperCase()} tx Confirmed:</b> Your transaction has been successfully confirmed. <a href="https://solscan.io/tx/${txids}">View Details</a>.`;
      }

      // update referral DB record
      const amountToUse = side == 'buy' ? amountIn : solFromSell;
      updateReferralBalance(ctx.session.chaidId, new BigNumber(amountToUse), ctx.session.referralCommision);
      
      updatePositions(
        ctx.session.chatId,
        userWallet,
        side,
        'ray_swap', // tradeType
        poolKeys.baseMint,
        outputToken.mint,
        userTokenBalanceAndDetails.userTokenName,
        userTokenBalanceAndDetails.userTokenSymbol,
        amountIn,
        extractAmount,
      );

      await ctx.api.sendMessage(ctx.session.chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });

      if (side == 'buy') {
        ctx.session.latestCommand = 'jupiter_swap';
        ctx.session.jupSwap_token = poolKeys.baseMint;
        await display_jupSwapDetails(ctx, false);
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