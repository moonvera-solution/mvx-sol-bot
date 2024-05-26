
import { PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getUserTokenBalanceAndDetails } from '../../service/feeds';

import { formatNumberToKOrM, getSolBalance, getSwapAmountOutPump } from '../../service/util';
import { Keypair, Connection } from '@solana/web3.js';
import { runAllFees } from '../util/getPriority';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { UserPositions } from '../../db';
import { getTokenDataFromBirdEyePositions } from '../../api/priceFeeds/birdEye';
import { SOL_ADDRESS } from "../../config";
import {jupiterInxSwap} from '../../service/dex/jupiter/trade/swaps';
import bs58 from 'bs58';
import BigNumber from 'bignumber.js';
import { saveUserPosition } from "../../service/portfolio/positions";
import { display_pumpFun } from '../pumpFun/pumpFunView';
import { getRayPoolKeys } from '../../service/dex/raydium/raydium-utils/formatAmmKeysById';
import { display_token_details } from '..';


export async function jupiterSwap(ctx:any){
    const chatId = ctx.chat.id;
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
    const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
    const payerKeypair = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[activeWalletIndexIdx].secretKey));
    const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
    const isBuySide = ctx.session.jupSwap_side == "buy";
    const tokenIn = isBuySide ? SOL_ADDRESS : ctx.session.jupSwap_token;
    const tokenOut = isBuySide ? ctx.session.jupSwap_token : SOL_ADDRESS;
    const userTokenBalanceAndDetails = isBuySide ?  await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection): await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenIn), connection);

    const amountToSell = Math.floor((ctx.session.jupSwap_amount /100) * userTokenBalanceAndDetails.userTokenBalance * Math.pow(10, userTokenBalanceAndDetails.decimals));
    const amountIn = isBuySide ? ctx.session.jupSwap_amount * 1e9 : amountToSell;
    const refObject = { referralWallet: ctx.session.referralWallet, referralCommision: ctx.referralCommision};
    if(!isBuySide && amountToSell <= 0){
      await ctx.api.sendMessage(chatId, `❌ You do not have enough ${userTokenBalanceAndDetails.userTokenSymbol} to sell.`, { parse_mode: 'HTML', disable_web_page_preview: true });
      return;

    }
    console.log('priorityFees:', ctx.session.priorityFees)
    await ctx.api.sendMessage(chatId, `🟢 <b>Transaction ${ctx.session.jupSwap_side.toUpperCase()}:</b> Processing ... Please wait for confirmation...`, { parse_mode: 'HTML', disable_web_page_preview: true });
    jupiterInxSwap(
        connection,
        rpcUrl,
        payerKeypair,
        tokenIn,
        tokenOut,
        amountIn,
       ( ctx.session.latestSlippage * 100),
        (ctx.session.customPriorityFee * 1e9),
        refObject
      ).then(async(txSig:any) => {
        console.log('txSigs:', txSig)
        const tradeType = isBuySide ? 'buy' : 'sell';

        if(txSig){
          const config = {
            searchTransactionHistory: true 
        };
          const sigStatus = await connection.getSignatureStatus(txSig,config) 
          if(sigStatus?.value?.err){
            await ctx.api.sendMessage(chatId, `❌ ${tradeType.toUpperCase()} tx failed. Please try again later.`, { parse_mode: 'HTML', disable_web_page_preview: true });
            return;
          }
          let tokenAmount,confirmedMsg;
          let solFromSell = 0;
          const _symbol = userTokenBalanceAndDetails.userTokenSymbol;
          let extractAmount =  await getSwapAmountOutPump(connection, [txSig.toString()], tradeType) 
          const amountFormatted = Number(extractAmount / Math.pow(10, userTokenBalanceAndDetails.decimals)).toFixed(4);
          tradeType == 'buy' ? tokenAmount = extractAmount : solFromSell = extractAmount;
          confirmedMsg = `✅ <b>${tradeType.toUpperCase()} tx confirmed</b> ${tradeType == 'buy' ? `You bought <b>${amountFormatted}</b> <b>${_symbol}</b> for <b>${ctx.session.jupSwap_amount} SOL</b>` : `You sold <b>${amountToSell/Math.pow(10,userTokenBalanceAndDetails.decimals)}</b> <b>${_symbol}</b> and received <b>${(solFromSell/1e9).toFixed(4)} SOL</b>`}. <a href="https://solscan.io/tx/${txSig}">View Details</a>.`;
          const userPosition = await UserPositions.findOne({ positionChatId: chatId, walletId: userWallet.publicKey.toString() });
          let oldPositionSol: number = 0;
          let oldPositionToken: number = 0;
          if (userPosition) {
            const existingPositionIndex = userPosition.positions.findIndex(
              position => position.baseMint === tokenOut.toString()
            );
            if (userPosition.positions[existingPositionIndex]) {
              oldPositionSol = userPosition.positions[existingPositionIndex].amountIn
              oldPositionToken = userPosition.positions[existingPositionIndex].amountOut!
            }
          }
    
         if( tradeType == 'buy')  {
          await saveUserPosition(ctx, 
            userWallet.publicKey.toString(),{
            baseMint: tokenOut,
            name: userTokenBalanceAndDetails.userTokenName,
            symbol: _symbol,
            tradeType: `jup_swap_${tradeType}`,
            amountIn: oldPositionSol ? oldPositionSol + (ctx.session.jupSwap_amount *1e9) : (ctx.session.jupSwap_amount *1e9),
            amountOut: oldPositionToken ? oldPositionToken + Number(extractAmount) : Number(extractAmount),
           
          });
          } else {
            let newAmountIn, newAmountOut;
            if (Number(extractAmount) === oldPositionToken || oldPositionSol <= extractAmount) {
              newAmountIn = 0;
              newAmountOut = 0;
            } else {
              newAmountIn = oldPositionSol > 0 ? oldPositionSol - extractAmount : oldPositionSol;
              newAmountOut = oldPositionToken > 0 ? oldPositionToken - Number(extractAmount) : oldPositionToken;
            }

            if ( newAmountIn <= 0 || newAmountOut <= 0  ) {
              await UserPositions.updateOne(
                { walletId: userWallet.publicKey.toString() },
                { $pull: { positions: { baseMint: tokenIn } } }
              );
              // ctx.session.positionIndex = 0;
              // await display_single_spl_positions(ctx);
            } else {
              await saveUserPosition(ctx,
                userWallet.publicKey.toString(),{
                baseMint: tokenIn,
                name: userTokenBalanceAndDetails.userTokenName,
                symbol: _symbol,
                tradeType: `jup_swap_${tradeType}`,
                amountIn: oldPositionSol ? oldPositionSol - amountToSell : amountToSell,
                amountOut: oldPositionToken ? oldPositionToken - Number(extractAmount) : Number(extractAmount),
              });
            }
          }
          await ctx.api.sendMessage(chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
          await display_jupSwapDetails(ctx, false);
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
    const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`

    let userWallet: any;
    if(ctx.session.portfolio){
        const selectedWallet = ctx.session.portfolio.activeWalletIndex;
        userWallet = ctx.session.portfolio.wallets[selectedWallet];
    }
    const publicKeyString: any = userWallet.publicKey; 
    console.log('rpcUrl:', rpcUrl)
    if (token) {
      const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
      const [
        birdeyeData,
        tokenMetadataResult,
        getSolBalanceData,
        jupTokenRate,
        userTokenDetails,
        userPosition,
        jupPriceImpact_5,

      ] = await Promise.all([
        getTokenDataFromBirdEyePositions(token,publicKeyString),
        getTokenMetadata(ctx, token),
        getSolBalance(publicKeyString, connection),
        fetch(
          `https://price.jup.ag/v6/price?ids=${token}&vsToken=So11111111111111111111111111111111111111112`
        ).then((response) => response.json()),
        getUserTokenBalanceAndDetails(new PublicKey(publicKeyString), token, connection),
        UserPositions.find({ positionChatId: chatId, walletId: publicKeyString }, { positions: { $slice: -7 } }),
        fetch(
          `${rpcUrl}/jupiter/quote?inputMint=${SOL_ADDRESS}&outputMint=${token}&amount=${'5000000000'}&slippageBps=${1}`
        ).then((response) => response.json()),


      ]);
      // console.log('responsiveness:', responsiveness)
      const {
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
      } = tokenMetadataResult;
      const lastRouteHop_5 = Number(jupPriceImpact_5.outAmount)
      const jupTokenValue: any =  Object.values(jupTokenRate.data);
      let jupTokenPrice = 0;

      if(jupTokenValue[0] && jupTokenValue[0].price ){
        jupTokenPrice = jupTokenValue[0].price;
        console.log('jupToken')
      }else if (!jupTokenValue[0] || jupTokenValue[0].price == undefined) {
        // ctx.session.latestCommand = 'raydium_swap';
        ctx.session.activeTradingPool = await getRayPoolKeys(ctx, token);
        console.log('activeTradingPool:', ctx.session.activeTradingPool)
        if(ctx.session.activeTradingPool){
        await display_token_details(ctx, false);
        return;
        } else {
          // ctx.session.latestCommand = 'pump_fun';
          ctx.session.pumpToken = new PublicKey(token);
          await display_pumpFun(ctx, false);
          return;

        }
    
      }  
      const {
        tokenData,
      } = tokenMetadataResult;
      const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.data.value : 0;
      const ammAddress = jupPriceImpact_5.routePlan[jupPriceImpact_5?.routePlan?.length - 1].swapInfo.ammKey;
      // const AllpriorityFees = await runAllFees(ctx, ammAddress);

      // const mediumpriorityFees = (AllpriorityFees.result2);
      // const highpriorityFees = (AllpriorityFees.result3);
      // const maxpriorityFees = (AllpriorityFees.result4);
      const tokenPriceUSD = birdeyeData
      && birdeyeData.response
      && birdeyeData.response.data
      && birdeyeData.response.data.data
      && birdeyeData.response.data.data.price != null  // This checks for both null and undefined
      ? birdeyeData.response.data.data.price
      : Number(jupTokenPrice) * Number(solPrice);
      
      const tokenPriceSOL = tokenPriceUSD / solPrice;
      const baseDecimals = tokenData.mint.decimals;
      const totalSupply = new BigNumber(tokenData.mint.supply.basisPoints);
      const Mcap = await formatNumberToKOrM(Number(totalSupply.dividedBy(Math.pow(10, baseDecimals)).times(tokenPriceUSD)));
     
      const userTokenBalance = birdeyeData 
      && birdeyeData.walletTokenPosition
      && birdeyeData.walletTokenPosition.data
      && birdeyeData.walletTokenPosition.data.data
      && birdeyeData.walletTokenPosition.data.data.balance > 0
      && birdeyeData.walletTokenPosition.data.data.valueUsd > 0
      ? birdeyeData.walletTokenPosition.data.data.uiAmount : (userTokenDetails.userTokenBalance / Math.pow(10, userTokenDetails.decimals));
      
      const netWorth = birdeyeData
      && birdeyeData.birdeyePosition
      && birdeyeData.birdeyePosition.data
      && birdeyeData.birdeyePosition.data.data
      && birdeyeData.birdeyePosition.data.data.totalUsd
      ? birdeyeData.birdeyePosition.data.data.totalUsd : NaN;
   
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
      
      const tokenToReceive_5 = ((lastRouteHop_5) / Math.pow(10,userTokenDetails.decimals))
      const newPrice = 5 / tokenToReceive_5;
      const priceImpact_5 = 1 + ((newPrice - tokenPriceSOL) / tokenPriceSOL) * 100;
      let messageText = `<b>------ ${tokenData.name}(${tokenData.symbol}) ------</b> | 📄 CA: <code>${token}</code> <a href="copy:${token}">🅲</a>\n` +
        `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
        `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
        `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
        `Market Cap: <b>${Mcap}</b> USD\n` +
        `Price:  <b>${tokenPriceSOL.toFixed(9)} SOL</b> | <b>${(tokenPriceUSD).toFixed(9)} USD</b> | <b>${tokenPriceSOL.toFixed(4)}</b> SOL\n\n` +
        `Price impact (5 SOL): <b>${priceImpact_5.toFixed(2)}%</b>\n\n` +
        `---<code>Trade Position</code>---\n` +
        `Initial : <b>${(initialInSOL).toFixed(4)} SOL</b> | <b>${(initialInUSD.toFixed(4))} USD</b>\n` +
        `Profit: ${profitInSol != 'N/A' ? Number(profitInSol).toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD != 'N/A' ? Number(profitInUSD).toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage != 'N/A' ? Number(profitPercentage).toFixed(2) : 'N/A'}%\n` +
        `Token Balance: <b>${userTokenBalance.toFixed(3)} $${userTokenDetails.userTokenSymbol} </b> | <b>${((userTokenBalance) * Number(tokenPriceUSD)).toFixed(4)} USD </b>| <b>${((userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n\n` +
        // `--<code>Priority fees</code>--\n Low: ${(Number(mediumpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(highpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(maxpriorityFees) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
        `Wallet balance: <b>${getSolBalanceData.toFixed(4)}</b> SOL | <b>${(getSolBalanceData * Number(solPrice)).toFixed(4)}</b> USD\n` +
        `Net Worth: <b>${netWorthSol.toFixed(4)}</b> SOL | <b>${netWorth.toFixed(4)}</b> USD\n` ;

      let options: any;
      options = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: ' 🔂 Refresh ', callback_data: 'refresh_Jupiter_swap' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
            [{ text: `Buy (X SOL)`, callback_data: 'buy_X_JUP' }, { text: 'Buy (0.5 SOL)', callback_data: 'buy_0.5_JUP' }, { text: 'Buy (1 SOL)', callback_data: 'buy_1_JUP' }],
            [{ text: `Sell X %`, callback_data: 'sell_X_JUP' },{ text: 'Sell 50%  ', callback_data: 'sell_50_JUP' },{ text: 'Sell 100%  ', callback_data: 'sell_100_JUP' }],
            // [{ text: '📈 Priority fees', callback_data: '_' }],
            // [
            //   { text: `Low ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_low' },
            //   { text: `Medium ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_medium' }, { text: `High ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_high' },{ text: `Custom ${priority_custom === true ? '✅' : ''}`, callback_data: 'priority_custom' }],
            [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage ' }, { text: `Set priority ${ctx.session.customPriorityFee}`, callback_data: 'set_customPriority' }],
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