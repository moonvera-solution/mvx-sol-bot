
import { PublicKey } from '@metaplex-foundation/js';
import { getLiquityFromOwner, getTokenMetadata, getuserShitBalance, getUserTokenBalanceAndDetails } from '../../service/feeds';

import { formatNumberToKOrM, getSolBalance, getSwapAmountOutPump } from '../../service/util';
import { Keypair, Connection } from '@solana/web3.js';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { UserPositions } from '../../db';
import { getTokenDataFromBirdEyePositions } from '../../api/priceFeeds/birdEye';
import { MVXBOT_FEES, SOL_ADDRESS } from "../../config";
import { jupiter_inx_swap } from '../../service/dex/jupiter/trade/swaps';
import bs58 from 'bs58';
import BigNumber from 'bignumber.js';
import { saveUserPosition } from "../../service/portfolio/positions";
import { display_pumpFun } from '../pumpfun/swapView';
import {  getRayPoolKeys } from '../../service/dex/raydium/utils/formatAmmKeysById';
import { display_raydium_details } from '../raydium/swapAmmView';
import { getRayCpmmPoolKeys } from '../../service/dex/raydium/cpmm';
import { display_cpmm_raydium_details } from '../raydium/swapCpmmView';
import { createTradeImage } from '../util/image';
import { InputFile } from 'grammy';
const fs = require('fs');


export async function jupiterSwap(ctx: any) {
  const chatId = ctx.chat.id;
  const connection = new Connection(`${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`);
  const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`

  const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
  console.log('activeWalletIndexIdx:', activeWalletIndexIdx)
  console.log('ctx.session.portfolio', ctx.session.portfolio)
  // if(!ctx.session.portfolio.wallets[activeWalletIndexIdx]){
  //   await ctx.api.sendMessage(chatId, `Bot got updated, please press /start to continue.`, { parse_mode: 'HTML', disable_web_page_preview: true });
  //   return;
  // }
  // if(ctx.session.portfolio.wallets[activeWalletIndexIdx] && ctx.session.portfolio.wallets[activeWalletIndexIdx].secretKey == undefined){
  //   await ctx.api.sendMessage(chatId, `Bot got updated, please press /start to continue.`, { parse_mode: 'HTML', disable_web_page_preview: true });
  //   return;
  // }
  const payerKeypair =  Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[activeWalletIndexIdx].secretKey));


  const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
  const isBuySide = ctx.session.jupSwap_side == "buy";
  const tokenIn = isBuySide ? SOL_ADDRESS : ctx.session.jupSwap_token;
  const tokenOut = isBuySide ? ctx.session.jupSwap_token : SOL_ADDRESS;
  // console.log('tokenOut',tokenOut)
  const userTokenBalanceAndDetails = isBuySide ? await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection) : await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenIn), connection);
  console.log('userTokenBalanceAndDetails::::::', userTokenBalanceAndDetails)
  const amountToSell = Math.floor((ctx.session.jupSwap_amount / 100) * userTokenBalanceAndDetails.userTokenBalance * Math.pow(10, userTokenBalanceAndDetails.decimals));
  const amountIn = isBuySide ? ctx.session.jupSwap_amount * 1e9 : amountToSell;
  // const refObject = { referralWallet: new PublicKey(ctx.session.generatorWallet).toBase58(), referralCommision: ctx.session.referralCommision };
  // console.log('refObject:', refObject)

  const minBalance = (amountIn + (amountIn * MVXBOT_FEES.toNumber()) + (ctx.session.customPriorityFee * 1e9));
  // if (isBuySide && minBalance > userSolBalance) {
  //   await ctx.api.sendMessage(chatId, `❌ You do not have enough SOL to buy ${userTokenBalanceAndDetails.userTokenSymbol}.`, { parse_mode: 'HTML', disable_web_page_preview: true });
  //   return;
  // }

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
      UserPositions.collection.dropIndex('positionChatId_1').catch((e: any) => console.error(e));
      const userPosition = await UserPositions.findOne({  walletId: userWallet.publicKey.toString() });
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
        console.log('extractAmount:', extractAmount)
        saveUserPosition(
          userWallet.publicKey.toString(), {
          baseMint: tokenOut,
          name: userTokenBalanceAndDetails.userTokenName,
          symbol: _symbol,
          tradeType: `jup_swap`,
          amountIn: oldPositionSol ? oldPositionSol + (ctx.session.jupSwap_amount * 1e9) : (ctx.session.jupSwap_amount * 1e9),
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
            tradeType: `jup_swap`,
            amountIn: newAmountIn,
            amountOut: newAmountOut,
          });
        }
        if(!ctx.session.autoBuyActive){
        ctx.session.latestCommand = 'jupiter_swap'
        }
      }
      await ctx.api.sendMessage(chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });

      if(tradeType == 'sell' && ctx.session.pnlcard ){
        const userShitbalance =   isBuySide ? await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection) : await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenIn), connection);

        if(userShitbalance.userTokenBalance == 0){

        await createTradeImage(_symbol, tokenIn, ctx.session.userProfit).then((buffer) => {
          // Save the image buffer to a file
          fs.writeFileSync('trade.png', buffer);
          console.log('Image created successfully');
        });
        await ctx.replyWithPhoto(new InputFile('trade.png' ));
      }
      }
      if (tradeType == 'buy' && !ctx.session.autoBuyActive) {
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
    // let priority_Level = ctx.session.priorityFees;
    // const priority_custom = ctx.session.ispriorityCustomFee;
    // if (priority_custom === true) {
    //   priority_Level = 0;
    // }
    const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`

    let userWallet: any;
    if (ctx.session.portfolio) {
      const selectedWallet = ctx.session.portfolio.activeWalletIndex;
      userWallet = ctx.session.portfolio.wallets[selectedWallet];
    }
    // console.log('selectedWallet:', userWallet)
    const publicKeyString: any = userWallet.publicKey;
    // console.log('rpcUrl:', rpcUrl)
    if (token) {
      const connection = new Connection(rpcUrl);
      // check if the token is tradable on jupiter
      const feeAccount = null;
      let swapUrl = `${rpcUrl}/jupiter/quote?inputMint=${SOL_ADDRESS}&outputMint=${token}&amount=${1}&slippageBps=${ctx.session.latestSlippage}${feeAccount ? '&platformFeeBps=08' : ''}`.trim();
      
      const [
        shitBalance,
        birdeyeData,
        tokenMetadataResult,
        getSolBalanceData,
        jupTokenRate,
        userTokenDetails,
        userPosition,
        jupPriceImpact_5,
        jupSolPrice,
        quoteResponse
      ] = await Promise.all([
        getuserShitBalance(publicKeyString,token, connection),
        getTokenDataFromBirdEyePositions(token, publicKeyString),
        getTokenMetadata(ctx, token),
        getSolBalance(publicKeyString, connection),
        fetch(`https://price.jup.ag/v6/price?ids=${token}&vsToken=So11111111111111111111111111111111111111112`).then((response) => response.json()),
        getUserTokenBalanceAndDetails(new PublicKey(publicKeyString), token, connection),
        UserPositions.find({ walletId: publicKeyString }, { positions: { $slice: -7 } }),
        fetch(`${rpcUrl}/jupiter/quote?inputMint=${SOL_ADDRESS}&outputMint=${token}&amount=${'5000000000'}&slippageBps=${1}`).then((response) => response.json()),
        fetch(`https://price.jup.ag/v6/price?ids=SOL`).then((response) => response.json()),
        fetch(swapUrl).then(res => res.json())
      ]);

      const {
        
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
      } = tokenMetadataResult;

      const jupTokenValue: any = Object.values(jupTokenRate.data);
      let jupTokenPrice = 0;
      // console.log('quoteResponse?.error_code:', quoteResponse)
      if (jupTokenValue[0] && jupTokenValue[0].price && (quoteResponse?.errorCode !== 'TOKEN_NOT_TRADABLE' && quoteResponse?.errorCode !== 'COULD_NOT_FIND_ANY_ROUTE' ) ) {
   
        jupTokenPrice = jupTokenValue[0].price;
        console.log('jupToken')
        //if not on jupiter check if token is on raydium 
      } else if (!jupTokenValue[0] || jupTokenValue[0].price == undefined || quoteResponse?.errorCode === 'TOKEN_NOT_TRADABLE' || quoteResponse?.errorCode === 'COULD_NOT_FIND_ANY_ROUTE') {
        console.log('raydium')
        ctx.session.activeTradingPoolId = await getRayPoolKeys(ctx, token);
        if (!ctx.session.isCpmmPool) {
          console.log('raydium AMM active')
          await display_raydium_details(ctx, false);
          return;
          // check for cpmm pool if no active trading pool is found
        } else if(ctx.session.isCpmmPool){
          console.log('Raydium CPMM active')
          // console.log('token here not jup')
          ctx.session.cpmmPoolId = ctx.session.activeTradingPoolId
          // console.log('cpmmPoolId:', ctx.session.cpmmPoolId)
          if (ctx.session.cpmmPoolId) {
            await display_cpmm_raydium_details(ctx, false);
            return;
          } else {
            // token not found on raydium or jupiter
            console.log('pump fun ')
            ctx.session.pumpToken = new PublicKey(token);
            await display_pumpFun(ctx, false);
            return;
          }

        } 
      }
      const {
        tokenData,
      } = tokenMetadataResult;
      const creatorAddress = birdeyeData && birdeyeData.response2.data.creatorAddress!= null ? birdeyeData.response2.data.creatorAddress : tokenData.updateAuthorityAddress.toBase58();
      const lpSupplyOwner = await getLiquityFromOwner(new PublicKey(creatorAddress), new PublicKey(token), connection);
    
      const islpBurnt =  "✅ Yes";
      const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.value :  Number(jupSolPrice.data.SOL.price);
      // const ammAddress = jupPriceImpact_5.routePlan[jupPriceImpact_5?.routePlan?.length - 1].swapInfo.ammKey;
      const tokenPriceUSD = birdeyeData
        && birdeyeData.response
        && birdeyeData.response.data
        // && birdeyeData.response.data.data
        && birdeyeData.response.data.price != null  // This checks for both null and undefined
        ? birdeyeData.response.data.price
        : Number(jupTokenPrice) * Number(solPrice);

      const tokenPriceSOL = tokenPriceUSD / solPrice;
      const baseDecimals = tokenData.mint.decimals;
      const totalSupply = new BigNumber(tokenData.mint.supply.basisPoints);
      const Mcap = await formatNumberToKOrM(Number(totalSupply.dividedBy(Math.pow(10, baseDecimals)).times(tokenPriceUSD)));
      const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;
      // console.log('userTokenBalance:', userTokenBalance)
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
        valueInUSD = (specificPosition.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, baseDecimals))) < 5 ? userTokenDetails.userTokenBalance * Number(tokenPriceUSD) : 'N/A';
        valueInSOL = (specificPosition.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, baseDecimals))) < 5 ? Number(((userTokenDetails.userTokenBalance)) * Number(tokenPriceSOL)) : 'N/A';
        initialInSOL = Number(specificPosition.amountIn) / 1e9;
        initialInUSD = initialInSOL * Number(solPrice);
        profitPercentage = valueInSOL != 'N/A' ? (Number(valueInSOL) - (Number(specificPosition.amountIn) / 1e9)) / (Number(specificPosition.amountIn) / 1e9) * 100 : 'N/A';
        profitInUSD = valueInUSD != 'N/A' ? Number(Number(userTokenDetails.userTokenBalance) * Number(tokenPriceUSD)) - initialInUSD : 'N/A';
        profitInSol = valueInSOL != 'N/A' ? (valueInSOL - initialInSOL).toFixed(4) : 'N/A';
      }
      ctx.session.userProfit = Number(profitPercentage)
      const freezable = birdeyeData?.response2.data.freezeable ? "⚠️ Be careful: This token is freezable." : "✅ Not freezable.";
      let messageText = `<b>------ ${tokenData.name}(${tokenData.symbol}) ------</b> | 📄 CA: <code>${token}</code> <a href="copy:${token}">🅲</a>\n` +
        `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
        `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
        `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
        `<b>LP Burnt:</b> ${islpBurnt} | <b>Freezable:</b> ${freezable} \n\n` +   
        `---<code>Token Details</code>---\n` +
        `Market Cap: <b>${Mcap}</b> USD\n` +
        `Price:  <b>${tokenPriceSOL.toFixed(9)} SOL</b> | <b>${(tokenPriceUSD).toFixed(9)} USD</b> \n\n` +
        `---<code>Trade Position</code>---\n` +
        `Initial : <b>${(initialInSOL).toFixed(4)} SOL</b> | <b>${(initialInUSD.toFixed(4))} USD</b>\n` +
        `Profit: ${profitInSol != 'N/A' ? Number(profitInSol).toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD != 'N/A' ? Number(profitInUSD).toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage != 'N/A' ? Number(profitPercentage).toFixed(2) : 'N/A'}%\n` +
        `Token Balance: <b>${shitBalance.userTokenBalance.toFixed(4)} $${userTokenSymbol} </b> | <b>${((shitBalance.userTokenBalance) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((shitBalance.userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
        `Wallet balance: <b>${getSolBalanceData.toFixed(4)}</b> SOL | <b>${(getSolBalanceData * Number(solPrice)).toFixed(4)}</b> USD\n` +
        `Net Worth: <b>${netWorthSol.toFixed(4)}</b> SOL | <b>${netWorth.toFixed(4)}</b> USD\n`;

      let options: any;
      options = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: ' 🔂 Refresh ', callback_data: 'refresh_Jupiter_swap' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
            [{ text: `Buy (X SOL)`, callback_data: 'buy_X_JUP' }, { text: 'Buy (0.5 SOL)', callback_data: 'buy_0.5_JUP' }, { text: 'Buy (1 SOL)', callback_data: 'buy_1_JUP' }],
            [{ text: `Sell X %`, callback_data: 'sell_X_JUP' }, { text: 'Sell 50%  ', callback_data: 'sell_50_JUP' }, { text: 'Sell 100%  ', callback_data: 'sell_100_JUP' }],
            [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: `Set priority ${ctx.session.customPriorityFee}`, callback_data: 'set_customPriority' }],
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
      ctx.api.sendMessage(chatId, "Token not found. ");
    }

  } catch (e) {
    console.log(e);
  }
}