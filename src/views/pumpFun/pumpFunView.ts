import { PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getUserTokenBalanceAndDetails } from '../../service/feeds';

import { formatNumberToKOrM, getSolBalance, getSwapAmountOutPump, waitForConfirmationPump } from '../../service/util';
import { Keypair, Connection } from '@solana/web3.js';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { getTokenDataFromBirdEyePositions } from '../../api/priceFeeds/birdEye';
import { getSwapDetails, swap_solTracker } from '../../service/dex/solTracker';
import { UserPositions } from '../../db/mongo/schema';
import { SOL_ADDRESS } from '../../config';
import bs58 from "bs58";
import BigNumber from 'bignumber.js';
import { saveUserPosition } from '../../service/portfolio/positions';


export async function swap_pump_fun(ctx: any) {
  try {
    const chatId = ctx.chat.id;
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
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
    if (tradeSide == 'buy' && userSolBalance < ctx.session.pump_amountIn) {
      await ctx.api.sendMessage(chatId, `❌ Insufficient SOL balance.`);
      return;
    }
    let msg = `🟢 <b>Transaction ${tradeSide.toUpperCase()}:</b> Processing... Please wait for confirmation.`
    await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
    await swap_solTracker(connection, {
      side: tradeSide,
      from: tokenIn,
      to: tokenOut,
      amount: tradeSide == 'buy' ? ctx.session.pump_amountIn : amountToSell,
      slippage: ctx.session.latestSlippage,
      payerKeypair: payerKeypair,
      referralWallet: new PublicKey(ctx.session.generatorWallet).toBase58(),
      referralCommision: ctx.session.referralCommision,
      priorityFee: ctx.session.customPriorityFee,
      forceLegacy: true
    }).then(async (txSigs) => {

      if (!txSigs) return;


      let extractAmount = await getSwapAmountOutPump(connection, txSigs, tradeSide);

      let confirmedMsg, solAmount, tokenAmount
      let solFromSell = 0;

      if (extractAmount > 0) {
        const amountFormatted = Number(extractAmount / Math.pow(10, userTokenBalanceAndDetails.decimals)).toFixed(4);
        tradeSide == 'buy' ? tokenAmount = extractAmount : solFromSell = extractAmount;
        confirmedMsg = `✅ <b>${tradeSide.toUpperCase()} tx confirmed</b> ${tradeSide == 'buy' ? `You bought <b>${amountFormatted}</b> <b>${_symbol}</b> for <b>${ctx.session.pump_amountIn} SOL</b>` : `You sold <b>${amountToSell}</b> <b>${_symbol}</b> and received <b>${(solFromSell / 1e9).toFixed(4)} SOL</b>`}. <a href="https://solscan.io/tx/${txSigs}">View Details</a>.`;
        await ctx.api.sendMessage(chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
      } else {
        confirmedMsg = `✅ <b>${tradeSide.toUpperCase()} tx Confirmed:</b> Your transaction has been successfully confirmed. <a href="https://solscan.io/tx/${txSigs}">View Details</a>.`;
        await ctx.api.sendMessage(chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
      }
      // ------- check user balanace in DB --------
      const userPosition = await UserPositions.findOne({ positionChatId: chatId, walletId: userWallet.publicKey.toString() });
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
        console.log('extractAmount', extractAmount);
        // if (await trackUntilFinalized(ctx, txids)) {
        await saveUserPosition( // to display portfolio positions
          ctx,
          userWallet.publicKey.toString(), {
          baseMint: ctx.session.pumpToken,
          name: userTokenBalanceAndDetails.userTokenName,
          symbol: _symbol,
          tradeType: `pump_swap`,
          amountIn: oldPositionSol ? oldPositionSol + ctx.session.pump_amountIn * 1e9 : ctx.session.pump_amountIn * 1e9,
          amountOut: oldPositionToken ? oldPositionToken + Number(extractAmount) : Number(extractAmount),
        });
        await display_pumpFun(ctx, false);
      } else {
        let newAmountIn, newAmountOut;

        if (Number(amountIn) === oldPositionToken || oldPositionSol <= extractAmount) {
          newAmountIn = 0;
          newAmountOut = 0;
          console.log('position remove');
        } else {
          newAmountIn = oldPositionSol > 0 ? oldPositionSol - extractAmount : oldPositionSol;
          newAmountOut = oldPositionToken > 0 ? oldPositionToken - Number(amountIn) : oldPositionToken;
          console.log('position update');
          console.log('newAmountIn', newAmountIn);
          console.log('newAmountOut', newAmountOut);
        }

        if (newAmountIn <= 0 || newAmountOut <= 0) {
          await UserPositions.updateOne({ walletId: userWallet.publicKey.toString() }, { $pull: { positions: { baseMint: tokenIn } } });
        } else {
          await saveUserPosition(ctx,
            userWallet.publicKey.toString(), {
            baseMint: tokenIn,
            name: userTokenBalanceAndDetails.userTokenName,
            symbol: _symbol,
            tradeType: `pump_swap`,
            amountIn: newAmountIn,
            amountOut: newAmountOut,
          });
        }
      }
      console.log('extractAmount', extractAmount);
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

      const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.data.value : 0;
      const baseDecimals = tokenData.mint.decimals;
      const totalSupply = new BigNumber(tokenData.mint.supply.basisPoints);
      const Mcap = await formatNumberToKOrM(Number(totalSupply.dividedBy(Math.pow(10, baseDecimals)).times(swapRates)) * solPrice);
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
        `Price:  <b>${swapRates.toFixed(9)} SOL</b> | <b>${(swapRates * solPrice).toFixed(9)} USD</b>\n\n` +
        `---<code>Trade Position</code>---\n` +
        `Initial : <b>${(initialInSOL).toFixed(4)} SOL</b> | <b>${(initialInUSD.toFixed(4))} USD</b>\n` +
        `Profit: ${profitInSol != 'N/A' ? Number(profitInSol).toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD != 'N/A' ? Number(profitInUSD).toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage != 'N/A' ? Number(profitPercentage).toFixed(2) : 'N/A'}%\n` +
        `Token Balance: <b>${userTokenBalance.toFixed(4)}</b> ${tokenData.symbol} | <b>${((userTokenBalance) * Number(swapRates * solPrice)).toFixed(3)} USD </b> |  <b>${((userTokenBalance) * Number(swapRates)).toFixed(4)} SOL </b> \n\n` +
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
            [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: `Set priority`, callback_data: 'set_customPriority' }],
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
