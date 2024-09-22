import { Percent, TokenAmount, TOKEN_PROGRAM_ID, Token as RayddiumToken } from '@raydium-io/raydium-sdk';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import { updatePositions, getSolBalance, updateReferralBalance, getSwapAmountOut } from '../../util';
import { DEFAULT_TOKEN, MVXBOT_FEES, CONNECTION } from '../../../config';
import { getUserTokenBalanceAndDetails } from '../../feeds';
import { raydium_amm_swap } from '../../dex';
import BigNumber from 'bignumber.js';
import bs58 from 'bs58';
import { display_jupSwapDetails } from '../../../views/jupiter/swapView';
import { createTradeImage } from "../../../views/util/image";
import { UserPositions } from '../../../db';
import { saveUserPosition } from '../positions';
import { InputFile } from 'grammy';
import { getSolanaDetails, memeTokenPrice } from '../../../api/priceFeeds/birdEye';
const fs = require('fs');

export async function handle_radyum_swap(
  ctx: any, 
  side: 'buy' | 'sell', 
  amountIn: any
) {
  const chatId = ctx.chat.id;
  const connection = CONNECTION;
  const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
  const tokenOut = ctx.session.AmmPoolKeys.mintA.address;
  try {
    let tokenIn: any, outputToken: any;
    const userTokenBalanceAndDetails = await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection);
    let userTokenBalance = userTokenBalanceAndDetails.userTokenBalance;
    const MEME_COIN = new RayddiumToken(TOKEN_PROGRAM_ID, tokenOut, userTokenBalanceAndDetails.decimals);

    /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
    /*                         BUY                                */
    /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
    if (side == 'buy') {
      amountIn = amountIn * Math.pow(10, 9); // lamports 
      tokenIn = DEFAULT_TOKEN.WSOL;
      outputToken = MEME_COIN;

      /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
      /*                        SELL                                */
      /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
    } else if (side == 'sell') {
      // balance and fees are in SOL dont change to lamports
      let userBalanceInLamports = userTokenBalance * Math.pow(10, userTokenBalanceAndDetails.decimals);
      // amountIn is in percentage to sell = 50%, 30% etc 
      const amountToSell = new BigNumber(userBalanceInLamports).multipliedBy(amountIn).dividedBy(100).integerValue(BigNumber.ROUND_FLOOR);
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
    const poolKeys = ctx.session.isCpmmPool ? ctx.session.cpmmPoolKeys.id : ctx.session.AmmPoolKeys;
    const inputTokenAmount = new TokenAmount(tokenIn!, new BigNumber(amountIn).toFixed());
    const slippage = new Percent(Math.ceil(ctx.session.latestSlippage * 100), 10_000);
  
    const customPriorityFee = ctx.session.customPriorityFee;
    console.log("customPriorityFee before swap:: ", customPriorityFee);
    let msg = `🟢 <b>Transaction ${side.toUpperCase()}:</b> Processing...\n Please wait for confirmation.`
    await ctx.api.sendMessage(ctx.session.chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });

    raydium_amm_swap(ctx, {
      connection,
      side,
      outputToken,
      targetPool: poolKeys.id, // ammId
      inputTokenAmount,
      slippage,
      customPriorityFee,
      wallet: Keypair.fromSecretKey(bs58.decode(String(userWallet.secretKey))),
      useJito: ctx.session.mevProtection,
      jitoTip: String(ctx.session.mevProtectionAmount * 1e9)
    }).then(async (txids) => {
      if (!txids) return;
      const config = {
        searchTransactionHistory: true
      };
      const sigStatus = await connection.getSignatureStatus(txids, config)
      if (sigStatus?.value?.err) {
        await ctx.api.sendMessage(chatId, `❌ ${side.toUpperCase()} tx failed. Please try again.`, { parse_mode: 'HTML', disable_web_page_preview: true });
        return;
      }
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
      }

      UserPositions.collection.listIndexes().toArray().then((indexes: any) => {
        if (indexes.some((index: any) => index.name === 'positionChatId_1')) {
          console.log('Index already exists');
          UserPositions.collection.dropIndex('positionChatId_1').catch((e: any) => console.error(e));
        }
      });      
      const userPosition = await UserPositions.findOne({ walletId: userWallet.publicKey.toString() });
      let oldPositionSol: number = 0;
      let oldPositionToken: number = 0;

      if (userPosition) {
      
        const existingPositionIndex = userPosition.positions.findIndex(
          position => position.baseMint === (side == 'buy' ? tokenOut.toString() : tokenIn.mint.toBase58())
        );
        // console.log('existingPositionIndex', existingPositionIndex);
        if (userPosition.positions[existingPositionIndex]) {
          oldPositionSol = userPosition.positions[existingPositionIndex].amountIn
          oldPositionToken = userPosition.positions[existingPositionIndex].amountOut!

        }
      }
      if (side == 'buy') {
        saveUserPosition(
          userWallet.publicKey.toString(), {
          baseMint: tokenOut,
          name: userTokenBalanceAndDetails.userTokenName,
          symbol: _symbol,
          tradeType: 'ray_swap',
          amountIn: oldPositionSol ? oldPositionSol + (amountIn) : (amountIn),
          amountOut: oldPositionToken ? oldPositionToken + Number(extractAmount) : Number(extractAmount),

        });
      }
      else if (side == 'sell') {
        let newAmountIn, newAmountOut;
     
        if (Number(amountIn) === oldPositionToken || oldPositionSol <= extractAmount) {
          newAmountIn = 0;
          newAmountOut = 0;
        } else {

          newAmountIn = oldPositionSol > 0 ? oldPositionSol - extractAmount : oldPositionSol;
          newAmountOut = oldPositionToken > 0 ? oldPositionToken - Number(amountIn) : oldPositionToken;

        }
        if (newAmountIn <= 0 || newAmountOut <= 0) {
          console.log('deleting here')
          await UserPositions.updateOne({ walletId: userWallet.publicKey.toString() }, { $pull: { positions: { baseMint: tokenOut } } });
          ctx.session.positionIndex = 0;
        } else {
          console.log('saving here')
          saveUserPosition(
            userWallet.publicKey.toString(), {
            baseMint: tokenOut,
            name: userTokenBalanceAndDetails.userTokenName,
            symbol: _symbol,
            tradeType: `ray_swap`,
            amountIn: newAmountIn,
            amountOut: newAmountOut,
          });
        }
        if (!ctx.session.autoBuy) {
          ctx.session.latestCommand = 'jupiter_swap'
        }
      }
      await ctx.api.sendMessage(ctx.session.chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
      // if (side == 'sell' && ctx.session.pnlcard) {
      //   const shitBalance = await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection);
      //   if (shitBalance.userTokenBalance == 0) {
      //     const tokenforRay = ctx.session.AmmPoolKeys.mintA.address;
      //     await createTradeImage(_symbol, tokenforRay, ctx.session.userProfit).then((buffer) => {
      //       // console.log('ctx.session.userProfit', ctx.session.userProfit)
      //       console.log('tokenIn', tokenIn)
      //       fs.writeFileSync('trade.png', buffer);
      //       console.log('Image created successfully');
      //     });
      //     await ctx.replyWithPhoto(new InputFile('trade.png'));
      //   }
      // }
      if (side == 'buy') {
        if (!ctx.session.autoBuy) {
          ctx.session.latestCommand = 'jupiter_swap';
          ctx.session.jupSwap_token = poolKeys.mintA.address;
          await display_jupSwapDetails(ctx, false);
        }
      }
    }
    )
  } catch (e: any) {
    await ctx.api.sendMessage(ctx.session.chatId, `🔴 ${side.toUpperCase()} Transaction failed`);
    console.error("ERROR on handle_radyum_trade: ", e);
    return;
  }

}