import { amount, PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getUserTokenBalanceAndDetails } from '../../service/feeds';

import { formatNumberToKOrM, getSolBalance, getSwapAmountOutPump, updatePositions } from '../../service/util';
import { Keypair, Connection } from '@solana/web3.js';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { getTokenDataFromBirdEyePositions } from '../../api/priceFeeds/birdEye';
import { getSwapDetails, swap_solTracker } from '../../service/dex/solTracker';
import { UserPositions } from '../../db/mongo/schema';
import { MVXBOT_FEES, SOL_ADDRESS } from '../../config';
import bs58 from "bs58";
import BigNumber from 'bignumber.js';


export async function swap_pump_fun(ctx: any) {
  try {
    // user details
    const chatId = ctx.chat.id;
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
    const payerKeypair: Keypair = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[activeWalletIndexIdx].secretKey));

    // swap params
    const tradeSide = ctx.session.pump_side;
    const tokenIn = tradeSide == 'buy' ? SOL_ADDRESS : ctx.session.pumpToken;
    const tokenOut = tradeSide == 'buy' ? ctx.session.pumpToken : SOL_ADDRESS;
    const userTokenBalanceAndDetails = tradeSide == 'buy' ?
      await getUserTokenBalanceAndDetails(payerKeypair.publicKey, new PublicKey(tokenOut), connection) :
      await getUserTokenBalanceAndDetails(new PublicKey(payerKeypair.publicKey), new PublicKey(tokenIn), connection);

    const amountToSell = (ctx.session.pump_amountIn / 100) * userTokenBalanceAndDetails.userTokenBalance;
    const userSolBalance = await getSolBalance(payerKeypair.publicKey, connection);

    // balance check
    // look here is a validation but does not account for fees        // Ill do a branch for you and you give it a test
    // this could work, but we need to test, this could work // yes bro
    const mvxFees = ctx.session.pump_amountIn.multipliedBy(MVXBOT_FEES).toNumber(); // mvx fee is always a % of the amountIn
    const slippage = ctx.session.pump_amountIn * ctx.session.latestSlippage / 100; // mvx fee is always a % of the amountIn
    const buyAmount = (ctx.session.pump_amountIn + ctx.session.customPriorityFee + mvxFees + slippage);
    if (tradeSide == 'buy' && userSolBalance < buyAmount) {
      await ctx.api.sendMessage(chatId, `❌ Insufficient SOL balance.`);
      return;
    }
    console.log('pumpfun_swap -->');
    console.log('userSolBalance: ', userSolBalance);
    console.log('buyAmount: ', buyAmount);
    console.log('bot_fee-1e9: ', mvxFees);
    console.log('customPriorityFee-1e9: ', ctx.session.customPriorityFee);
    console.log('swapAmountIn-1e9: ', ctx.session.pump_amountIn);
    // before swap feedback
    let msg = `🟢 Sending ${tradeSide} transaction, please wait for confirmation.`;
    await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
    const tradeAmount = tradeSide == 'buy' ? ctx.session.pump_amountIn : amountToSell;
    // swap call
    await swap_solTracker(connection, {
      side: tradeSide,
      from: tokenIn,
      to: tokenOut,
      amount: tradeAmount,
      slippage: ctx.session.latestSlippage,
      payerKeypair: payerKeypair,
      referralWallet: new PublicKey(ctx.session.generatorWallet).toBase58(),
      referralCommision: ctx.session.referralCommision,
      priorityFee: ctx.session.customPriorityFee, // here for pumpfun, only raydium is the complex one, ya
      forceLegacy: true
    }).then(async (txSigs) => {
      if (!txSigs) {
        console.log('NULLL txSigs', txSigs);
        return;
      } else {
        console.log('txSigs', txSigs);
        let extractAmount: number = await getSwapAmountOutPump(connection, txSigs, tradeSide);
        const amountFormatted: string = Number(extractAmount / Math.pow(10, userTokenBalanceAndDetails.decimals)).toFixed(4);

        const settleMsg = tradeSide == 'buy' ?
          `You bought <b>${amountFormatted}</b> <b>${userTokenBalanceAndDetails.userTokenSymbol}</b> for <b>${ctx.session.pump_amountIn} SOL</b>` :
          `You sold <b>${amountToSell}</b> <b>${userTokenBalanceAndDetails.userTokenSymbol}</b> for <b>${(extractAmount / 1e9).toFixed(4)} SOL</b>`;

        await ctx.api.sendMessage(chatId,
          `✅ ${settleMsg} <a href="https://solscan.io/tx/${txSigs}">View Details</a>.`,
          { parse_mode: 'HTML', disable_web_page_preview: true });

        // NO await - avoid blocking thread while db calls are done, function will complete in the background
        updatePositions(
          chatId,
          payerKeypair,
          tradeSide,'pump_swap', tokenIn, tokenOut,
          userTokenBalanceAndDetails.userTokenName,
          userTokenBalanceAndDetails.userTokenSymbol,
          tradeAmount, extractAmount
        );
      }
    });

  } catch (e) {
    await ctx.api.sendMessage(ctx.chat.id, `❌ Swap failed`);
    console.error(e);
  }
}

export async function display_pumpFun(ctx: any, isRefresh: boolean) {
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
      const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
      const pumpFunLink = `https://pump.fun/${token}`;
      const [
        birdeyeData,
        tokenMetadataResult,
        swapRates,
        getSolBalanceData,
        userTokenDetails,
        userPosition,
        // AllpriorityFees

      ] = await Promise.all([
        getTokenDataFromBirdEyePositions(token, publicKeyString),
        getTokenMetadata(ctx, token),
        getSwapDetails(token, solAddress, 1, 0),
        getSolBalance(publicKeyString, connection),
        getUserTokenBalanceAndDetails(new PublicKey(publicKeyString), token, connection),
        UserPositions.find({ positionChatId: chatId, walletId: publicKeyString }, { positions: { $slice: -7 } }),
        // runAllFees(ctx, token)
      ]);

      // const mediumpriorityFees = (AllpriorityFees.result2);
      // const highpriorityFees = (AllpriorityFees.result3);
      // const maxpriorityFees = (AllpriorityFees.result4);

      const {
        tokenData,
      } = tokenMetadataResult;

      const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.value : 0;
      const baseDecimals = tokenData.mint.decimals;
      const totalSupply = new BigNumber(tokenData.mint.supply.basisPoints);
      const Mcap = await formatNumberToKOrM(Number(totalSupply.dividedBy(Math.pow(10, baseDecimals)).times(swapRates)) * solPrice);
      const userTokenBalance = birdeyeData
        && birdeyeData.walletTokenPosition
        && birdeyeData.walletTokenPosition.data
        // && birdeyeData.walletTokenPosition.data.data
        && birdeyeData.walletTokenPosition.data.balance > 0
        && birdeyeData.walletTokenPosition.data.valueUsd > 0
        ? birdeyeData.walletTokenPosition.data.uiAmount : (userTokenDetails.userTokenBalance);
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
        profitPercentage = valueInSOL != 'N/A' ? (Number(valueInSOL) - (Number(specificPosition.amountIn) / 1e9)) / (Number(specificPosition.amountIn) / 1e9) * 100 : 'N/A';
        profitInUSD = valueInUSD != 'N/A' ? Number(Number(userTokenDetails.userTokenBalance) * Number(swapRates * solPrice)) - initialInUSD : 'N/A';
        profitInSol = valueInSOL != 'N/A' ? (valueInSOL - initialInSOL).toFixed(4) : 'N/A';
      }


      let messageText = `<b>------ ${tokenData.name}(${tokenData.symbol}) ------</b>\n` +
        `💊 <a href="${pumpFunLink}">Pump fun</a>\n` +
        `Contract: <code>${token}</code>\n` +
        `Market Cap: <b>${Mcap}</b> USD\n` +
        `Price:  <b>${new BigNumber(swapRates).toFixed(9)} SOL</b> | <b>${new BigNumber(swapRates * solPrice).toFixed(9)} USD</b>\n\n` +
        `---<code>Trade Position</code>---\n` +
        `Initial : <b>${(initialInSOL).toFixed(4)} SOL</b> | <b>${(initialInUSD.toFixed(4))} USD</b>\n` +
        `Profit: ${profitInSol != 'N/A' ? Number(profitInSol).toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD != 'N/A' ? Number(profitInUSD).toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage != 'N/A' ? Number(profitPercentage).toFixed(2) : 'N/A'}%\n` +
        `Token Balance: <b>${userTokenBalance.toFixed(4)}</b> ${tokenData.symbol} | <b>${((userTokenBalance) * Number(swapRates * solPrice)).toFixed(3)} USD </b> |  <b>${((userTokenBalance) * Number(swapRates)).toFixed(4)} SOL </b> \n\n` +
        // `--<code>Priority fees</code>--\n Low: ${(Number(mediumpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(highpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(maxpriorityFees) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
        `Wallet balance: <b>${getSolBalanceData.toFixed(4)}</b> SOL | <b>${(getSolBalanceData * solPrice).toFixed(4)}</b> USD\n` +
        `Net Worth: <b>${netWorthSol.toFixed(4)}</b> SOL | <b>${netWorth.toFixed(4)}</b> USD\n`;
      console.log('ctx.session.customPriorityFee', ctx.session.customPriorityFee);

      let options: any;
      options = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: ' 🔂 Refresh ', callback_data: 'refresh_pump_fun' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
            // [{ text: `Buy X  (SOL)`, callback_data: 'buy_X_PUMP' }, { text: 'Buy (0.5 SOL)', callback_data: 'buy_0.5_PUMP' }, { text: 'Buy (1 SOL)', callback_data: 'buy_1_PUMP' }],
            // [{ text: `Sell X %`, callback_data: 'sell_X_PUMP' }, { text: 'Sell 50%  ', callback_data: 'sell_50_PUMP' }, { text: 'Sell 100%  ', callback_data: 'sell_100_PUMP' }],
            // [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: `set_slippage` }, { text: `Set priority ${ctx.session.customPriorityFee}`, callback_data: 'set_customPriority' }],
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
