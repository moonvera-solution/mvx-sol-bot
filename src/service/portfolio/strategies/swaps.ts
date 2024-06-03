import { Percent, TokenAmount, TOKEN_PROGRAM_ID, Token as RayddiumToken } from '@raydium-io/raydium-sdk';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import { getWalletTokenAccount, getSolBalance, waitForConfirmation, getSwapAmountOut } from '../../util';
import { DEFAULT_TOKEN, MVXBOT_FEES } from '../../../../config';
import { getUserTokenBalanceAndDetails } from '../../feeds';
import { ISESSION_DATA } from '../../util/types';
import { saveUserPosition } from "../positions";
import { raydium_amm_swap } from '../../dex';
import BigNumber from 'bignumber.js';
import bs58 from 'bs58';
import { Referrals, UserPositions } from '../../../db/mongo/schema';
import { display_jupSwapDetails } from '../../../views/jupiter/jupiterSwapView';
import { hasEnoughToken } from '../../../service/util/validations';

export async function handle_radyum_swap(
  ctx: any,
  tokenOut: PublicKey,
  side: 'buy' | 'sell',
  swapAmountIn: any
) {
  const chatId = ctx.chat.id;
  const session: ISESSION_DATA = ctx.session;
  const userWallet = session.portfolio.wallets[session.portfolio.activeWalletIndex];
  let userSlippage = session.latestSlippage;
  let mvxFee = new BigNumber(0);
  let refferalFeePay = new BigNumber(0);
  const referralWallet = ctx.session.generatorWallet;
  console.log('customPriorityFee', ctx.session.customPriorityFee);

  try {
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
    const userTokenBalanceAndDetails = await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection);
    // console.log("userTokenBalanceAndDetails", userTokenBalanceAndDetails)
    const poolKeys = ctx.session.activeTradingPool;
    const OUTPUT_TOKEN = new RayddiumToken(TOKEN_PROGRAM_ID, tokenOut, userTokenBalanceAndDetails.decimals);
    const walletTokenAccounts = await getWalletTokenAccount(connection, new PublicKey(userWallet.publicKey));
    let userSolBalance = await getSolBalance(userWallet.publicKey, connection);
    let userTokenBalance = userTokenBalanceAndDetails.userTokenBalance;
    let tokenIn, outputToken;
    const referralFee = ctx.session.referralCommision / 100;

    // ------- check user balanace in DB --------
    const userPosition = await UserPositions.findOne({ positionChatId: chatId, walletId: userWallet.publicKey.toString() });
    // console.log("userPosition", userPosition);

    let oldPositionSol: number = 0;
    let oldPositionToken: number = 0;
    if (userPosition) {
      // console.log("userPosition", userPosition);
      const existingPositionIndex = userPosition.positions.findIndex(
        position => position.baseMint === tokenOut.toString()
      );
      if (userPosition.positions[existingPositionIndex]) {
        oldPositionSol = userPosition.positions[existingPositionIndex].amountIn
        oldPositionToken = userPosition.positions[existingPositionIndex].amountOut!
      }
    }

    if (side == 'buy') {
      let originalBuyAmt = swapAmountIn;
      let amountUse = new BigNumber(originalBuyAmt);
      tokenIn = DEFAULT_TOKEN.WSOL;
      outputToken = OUTPUT_TOKEN;
      swapAmountIn = Number(swapAmountIn) * 1e9;

      // ------------ MVXBOT_FEES  and referral ------------

      const bot_fee = new BigNumber(amountUse.multipliedBy(MVXBOT_FEES));
      const referralAmmount = (bot_fee.multipliedBy(referralFee));
      const cut_bot_fee = bot_fee.minus(referralAmmount);
      if (referralFee > 0) {
        mvxFee = new BigNumber(cut_bot_fee.multipliedBy(1e9));
        refferalFeePay = new BigNumber(referralAmmount).multipliedBy(1e9);
      } else {
        mvxFee = new BigNumber(bot_fee).multipliedBy(1e9);
      }
      // const slippage = swapAmountIn * ctx.session.latestSlippage / 100;
      // const buyAmount = (swapAmountIn.multipliedBy(1e9).toNumber() + bot_fee.multipliedBy(1e9).toNumber() + (ctx.session.customPriorityFee.multipliedBy(1e9).toNumber()) + slippage);
      // if ((userSolBalance * 1e9) < buyAmount) {
      //   await ctx.api.sendMessage(chatId, `🔴 Insufficient balance. Your balance is ${userSolBalance} SOL`);
      //   return;
      // }
      // console.log('raydium_swap -->');
      // console.log('userSolBalance: ', userSolBalance);
      // console.log('buyAmount: ', buyAmount);
      // console.log('bot_fee-1e9: ', bot_fee.multipliedBy(1e9).toNumber());
      // console.log('customPriorityFee-1e9: ', ctx.session.customPriorityFee.multipliedBy(1e9).toNumber());
      // console.log('swapAmountIn-1e9: ', swapAmountIn.multipliedBy(1e9).toNumber());

      // mvxFee = new BigNumber(swapAmountIn).times(MVXBOT_FEES);
      // await ctx.api.sendMessage(chatId, `💸 Buying ${originalBuyAmt} SOL of ${userTokenBalanceAndDetails.userTokenSymbol}`);
    } else {

      let percent = swapAmountIn;
      tokenIn = OUTPUT_TOKEN;
      outputToken = DEFAULT_TOKEN.WSOL;
      let sellAmountPercent = userTokenBalance * Math.pow(10, userTokenBalanceAndDetails.decimals);
      swapAmountIn = new BigNumber(swapAmountIn).multipliedBy(sellAmountPercent).dividedBy(100).integerValue(BigNumber.ROUND_FLOOR);

      // validate if user has enough token balance and send message if not
      if (!await hasEnoughToken(ctx, userTokenBalanceAndDetails, swapAmountIn.toNumber())) return;

      // await ctx.api.sendMessage(chatId, `💸 Selling ${percent}% ${userTokenBalanceAndDetails.userTokenSymbol}`);
    }
    // console.log('swapAmountIn', swapAmountIn);
    // console.log('testing')
    const inputTokenAmount = new TokenAmount(tokenIn, (swapAmountIn.toFixed()));
    const slippage = new Percent(Math.ceil(userSlippage * 100), 10_000);
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
    const referralRecord = await Referrals.findOne({ referredUsers: chatId });
    let actualEarnings = referralRecord && referralRecord.earnings;

    // referalRecord.earnings = updateEarnings;
    // console.log("pfee from swap", ctx.session.priorityFees);

    if (poolKeys) {
      //   console.log('poolKeys');
      let msg = `🟢 <b>Transaction ${side.toUpperCase()}:</b> Processing... Please wait for confirmation.`
      await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });

      raydium_amm_swap({
        ctx,
        side,
        mvxFee,
        refferalFeePay,
        referralWallet,
        outputToken,
        targetPool: poolKeys.id, // ammId
        inputTokenAmount,
        slippage,
        walletTokenAccounts,
        wallet: Keypair.fromSecretKey(bs58.decode(String(userWallet.secretKey))),
        commitment: 'processed',
        skipPreflight: true,
        maxRetries: 0,
      }).then(async (txids) => {

        if (!txids) return;
        if (txids) {
          const config = {
            searchTransactionHistory: true
          };
          const sigStatus = await connection.getSignatureStatus(txids, config)
          if (sigStatus?.value?.err) {
            await ctx.api.sendMessage(chatId, `❌ ${side.toUpperCase()} tx failed. Please try again later.`, { parse_mode: 'HTML', disable_web_page_preview: true });
            return;
          }
          let extractAmount = await getSwapAmountOut(connection, txids);
          let confirmedMsg, solAmount, tokenAmount, _symbol = userTokenBalanceAndDetails.userTokenSymbol;
          let solFromSell = 0;
          const amountFormatted = Number(extractAmount / Math.pow(10, userTokenBalanceAndDetails.decimals)).toFixed(4);
          side == 'buy' ? tokenAmount = extractAmount : solFromSell = extractAmount;
          side == 'buy' ?
            confirmedMsg = `✅ <b>${side.toUpperCase()} tx Confirmed:</b> You bought ${amountFormatted} <b>${_symbol}</b> for ${(swapAmountIn / 1e9).toFixed(4)} <b>SOL</b>. <a href="https://solscan.io/tx/${txids}">View Details</a>.`
            :
            confirmedMsg = `✅ <b>${side.toUpperCase()} tx Confirmed:</b> You sold ${Number(Number(swapAmountIn) / Math.pow(10, Number(userTokenBalanceAndDetails.decimals))).toFixed(4)} <b>${_symbol}</b> for ${(solFromSell / 1e9).toFixed(4)} <b>SOL</b>. <a href="https://solscan.io/tx/${txids}">View Details</a>.`;
          await ctx.api.sendMessage(chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });

          const bot_fee = new BigNumber(solFromSell).multipliedBy(MVXBOT_FEES);
          const referralAmmount = (bot_fee.multipliedBy(referralFee));
          const cut_bot_fee = bot_fee.minus(referralAmmount);

          if (referralRecord) {
            let updateEarnings = actualEarnings && actualEarnings + (refferalFeePay).toNumber();
            referralRecord.earnings = Number(updateEarnings && updateEarnings.toFixed(0));
            await referralRecord.save();
          }

          if (side == 'buy') {

            saveUserPosition( // to display portfolio positions
              chatId,
              userWallet.publicKey.toString(), {
              baseMint: poolKeys.baseMint,
              name: userTokenBalanceAndDetails.userTokenName,
              symbol: _symbol,
              tradeType: `ray_swap`,
              amountIn: oldPositionSol ? oldPositionSol + swapAmountIn : swapAmountIn,
              amountOut: oldPositionToken ? oldPositionToken + Number(extractAmount) : Number(extractAmount),
            });
            // }

          } else if (side == 'sell') {
            if (referralFee > 0) {
              mvxFee = new BigNumber(cut_bot_fee);
              refferalFeePay = new BigNumber(referralAmmount);
            } else {
              mvxFee = new BigNumber(bot_fee);
            }

            let newAmountIn, newAmountOut;
            if (Number(swapAmountIn) === oldPositionToken || oldPositionSol <= extractAmount) {
              newAmountIn = 0;
              newAmountOut = 0;
            } else {
              newAmountIn = oldPositionSol > 0 ? oldPositionSol - extractAmount : oldPositionSol;
              newAmountOut = oldPositionToken > 0 ? oldPositionToken - Number(swapAmountIn) : oldPositionToken;
            }


            if (
              newAmountIn == 0
              || newAmountOut == 0
              || newAmountOut < 0
              || newAmountIn < 0
              // || userBalance.toNumber() == 0
            ) {
              await UserPositions.updateOne(
                { walletId: userWallet.publicKey.toString() },
                { $pull: { positions: { baseMint: poolKeys.baseMint } } }
              );
              ctx.session.positionIndex = 0;
              console.log(chatId, 'amount == 0');
              // await display_single_spl_positions(ctx);
            } else {
              saveUserPosition(
                chatId,
                userWallet.publicKey.toString(), {
                baseMint: poolKeys.baseMint,
                name: userTokenBalanceAndDetails.userTokenName,
                symbol: _symbol,
                tradeType: `ray_swap`,
                amountIn: newAmountIn,
                amountOut: newAmountOut,
              }).then(r => console.log(chatId, 'amount != 0'));
            }
            ctx.session.latestCommand = 'jupiter_swap'

          }
          if (side == 'buy') {
            ctx.session.latestCommand = 'jupiter_swap';
            ctx.session.jupSwap_token = poolKeys.baseMint;
            await display_jupSwapDetails(ctx, false);
          }

        }

      }).catch(async (error: any) => {
        console.log('afterswap. ', error)
        console.log('here... ', error.message)
        await ctx.api.sendMessage(chatId, `🔴 ${side.toUpperCase()} ${error.message}.`);
        return;
      });
    } else {
      await ctx.api.sendMessage(chatId, `🔴 ${side.toUpperCase()} network issues, try again.`);
    }
  } catch (e: any) {
    console.log("swap line 231", e.message)
    await ctx.api.sendMessage(chatId, `🔴 ${side.toUpperCase()} ${e.message}`);
    console.error("ERROR on handle_radyum_trade: ", e);
  }

}