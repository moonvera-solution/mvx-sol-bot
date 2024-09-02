import { Percent, TokenAmount, TOKEN_PROGRAM_ID, Token as RayddiumToken } from '@raydium-io/raydium-sdk';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import {updatePositions, getSolBalance, updateReferralBalance, getSwapAmountOut } from '../../util';
import { DEFAULT_TOKEN, MVXBOT_FEES,CONNECTION, SOL_ADDRESS } from '../../../config';
import { getTokenMetadata, getuserShitBalance, getUserTokenBalanceAndDetails } from '../../feeds';
import { raydium_amm_swap } from '../../dex';
import BigNumber from 'bignumber.js';
import bs58 from 'bs58';
import { display_jupSwapDetails } from '../../../views/jupiter/swapView';
import { createTradeImage } from '../../../views/util/image';
import { InputFile } from 'grammy';
import { raydium_amm_swap_v4 } from '../../../service/dex/raydium/amm/ammv4';
import { AmmRpcData, AmmV4Keys, ApiV3PoolInfoStandardItem } from '@raydium-io/raydium-sdk-v2';
import { token } from '@metaplex-foundation/js';
import { UserPositions } from '../../../db';
import { saveUserPosition } from '../positions';

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
    // console.log('ammPoolKeys:: ', ctx.session.AmmPoolKeys);
    const tokenOut = ctx.session.AmmPoolKeys.mintA.address

    const AmmPoolId = ctx.session.AmmPoolKeys.id;
    const [userTokenBalanceAndDetails, tokenMeta] = await Promise.all([
    getuserShitBalance(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection),
    getTokenMetadata(ctx, tokenOut),
    ]);

    let userTokenBalance = Number(userTokenBalanceAndDetails.userTokenBalance);
    let tokenDecimal = Number(ctx.session.AmmPoolKeys.mintA.decimals);
    let _symbol = tokenMeta.tokenData.symbol;
    console.log('_symbol:: ', _symbol); 
    let _name = tokenMeta.tokenData.name;
    console.log('_name:: ', _name);
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

      // amountIn is in percentage to sell = 50%, 30% etc 
      const amountToSell = Math.floor((amountIn/ 100) * userTokenBalance * Math.pow(10, tokenDecimal));
      console.log("amountToSell:: ",amountToSell);

      if ( amountToSell <= 0) {
        await ctx.api.sendMessage(ctx.session.chatId, `❌ You do not have enough ${_symbol} to sell.`, { parse_mode: 'HTML', disable_web_page_preview: true });
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
    const ammPoolInfo: ApiV3PoolInfoStandardItem = ctx.session.AmmPoolInfo;
    // const inputTokenAmount = new TokenAmount(tokenIn!, new BigNumber(amountIn).toFixed());
    const slippage = ((ctx.session.latestSlippage + 10) * 100/ 10_000);
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
      ammPoolInfo,
      rpcData,
      outputToken,
      amountIn,
      slippage,
      customPriorityFee,
      wallet: Keypair.fromSecretKey(bs58.decode(String(userWallet.secretKey))),
    }).then(async (txids) => {
      if (!txids) return;

      const config = {
        searchTransactionHistory: true
      };
      const sigStatus = await connection.getSignatureStatus(txids, config)
      if (sigStatus?.value?.err) {
        await ctx.api.sendMessage(ctx.session.chatId, `❌ ${side.toUpperCase()} tx failed. Please try again later.`, { parse_mode: 'HTML', disable_web_page_preview: true });
        return;
      }
      // console.log("txids:: ", txids);
      let extractAmount = await getSwapAmountOut(connection, txids);
      let tokenAmount, confirmedMsg;
      let solFromSell = 0;
      // const _symbol = userTokenBalanceAndDetails.userTokenSymbol;
      
      // console.log('tokenMetada:: ', tokenMeta);
      const amountFormatted = Number(extractAmount / Math.pow(10, tokenMeta.tokenData.mint.decimals)).toFixed(4);
      // console.log('amountFormatted:: ', amountFormatted); 
      side == 'buy' ? tokenAmount = extractAmount : solFromSell = extractAmount;
      confirmedMsg = `✅ <b>${side.toUpperCase()} tx confirmed</b> ${side == 'buy' ? `You bought <b>${amountFormatted}</b> <b>${_symbol}</b> for <b>${amountIn/1e9} SOL</b>` : `You sold <b>${amountIn / Math.pow(10, tokenMeta.tokenData.mint.decimals)}</b> <b>${_symbol}</b> and received <b>${(solFromSell / 1e9).toFixed(4)} SOL</b>`}. <a href="https://solscan.io/tx/${txids}">View Details</a>.`;

      let oldPositionSol: number = 0;
      let oldPositionToken: number = 0;
      UserPositions.collection.dropIndex('positionChatId_1').catch((e: any) => console.error(e));
      const userPosition = await UserPositions.findOne({  walletId: userWallet.publicKey.toString() });
   
      if (userPosition) {
        const existingPositionIndex = userPosition.positions.findIndex(
          position => position.baseMint === (side ? tokenOut.toString() : tokenIn.toString())
        );
        // console.log('existingPositionIndex', existingPositionIndex);
        if (userPosition.positions[existingPositionIndex]) {
          oldPositionSol = userPosition.positions[existingPositionIndex].amountIn
          oldPositionToken = userPosition.positions[existingPositionIndex].amountOut!
        }
      }

      if (side == 'buy') {
        // console.log('extractAmount:', extractAmount)
        saveUserPosition(
          userWallet.publicKey.toString(), {
          baseMint: tokenOut,
          name: _name,
          symbol: _symbol,
          tradeType: `ray_swap`,
          amountIn: oldPositionSol ? oldPositionSol + (amountIn) : (amountIn),
          amountOut: oldPositionToken ? oldPositionToken + Number(extractAmount) : Number(extractAmount),
        });
      } else if (side == 'sell') {
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
            name: _name,
            symbol: _symbol,
            tradeType: `ray_swap`,
            amountIn: newAmountIn,
            amountOut: newAmountOut,
          });
        }
      }

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