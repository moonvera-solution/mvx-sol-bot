import { Liquidity, LiquidityPoolKeys, Percent, jsonInfo2PoolKeys, TokenAmount, TOKEN_PROGRAM_ID, Token as RayddiumToken, publicKey } from '@raydium-io/raydium-sdk';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import { getWalletTokenAccount, getSolBalance, waitForConfirmation,getPriorityFeeLabel, trackUntilFinalized } from '../../util';
import { DEFAULT_TOKEN, MVXBOT_FEES } from '../../../../config';
import { getUserTokenBalanceAndDetails } from '../../feeds';
import { display_token_details } from '../../../views';
import { ISESSION_DATA } from '../../util/types';
import { saveUserPosition } from "../positions";
import { raydium_amm_swap } from '../../dex';
import BigNumber from 'bignumber.js';
import axios from 'axios';
import bs58 from 'bs58';
import { Referrals, UserPositions } from '../../../db/mongo/schema';


export async function handle_radyum_swap(
    ctx: any,
    tokenOut: PublicKey,
    side: 'buy' | 'sell',
    swapAmountIn: any) {
    const chatId = ctx.chat.id;
    const session: ISESSION_DATA = ctx.session;
    const userWallet = session.portfolio.wallets[session.activeWalletIndex];
    let userSlippage = session.latestSlippage;
    let mvxFee = new BigNumber(0);
    let refferalFeePay = new BigNumber(0);
    const referralWallet = ctx.session.generatorWallet;

    try {
        const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);
        const userTokenBalanceAndDetails = await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection);
        const poolKeys = ctx.session.activeTradingPool;
        const OUTPUT_TOKEN = new RayddiumToken(TOKEN_PROGRAM_ID, tokenOut, userTokenBalanceAndDetails.decimals);
        const walletTokenAccounts = await getWalletTokenAccount(connection, new PublicKey(userWallet.publicKey));
        let userSolBalance = await getSolBalance(userWallet.publicKey, connection);
        let userTokenBalance = userTokenBalanceAndDetails.userTokenBalance;
        let tokenIn, outputToken;
        const referralFee = ctx.session.referralCommision / 100;


        // ------- check user balanace in DB --------
        const userPosition = await UserPositions.findOne({ positionChatId: chatId, walletId: userWallet.publicKey.toString() });
        console.log("userPosition", userPosition);

        let oldPositionSol: number = 0;
        let oldPositionToken: number = 0;
        if (userPosition) {
            // console.log("userPosition", userPosition);
            const existingPositionIndex = userPosition.positions.findIndex(
                position => position.baseMint === tokenOut.toString()
            );
            if (userPosition.positions[existingPositionIndex]) {
                oldPositionSol = userPosition?.positions[existingPositionIndex].amountIn
                oldPositionToken = userPosition?.positions[existingPositionIndex].amountOut!
            }
        }

        if (side == 'buy') {
            let originalBuyAmt = swapAmountIn;
            let amountUse = new BigNumber(originalBuyAmt);
            if (userSolBalance < swapAmountIn) {
                await ctx.api.sendMessage(chatId, `🔴 Insufficient balance. Your balance is ${userSolBalance} SOL`);
                return;
            }
            tokenIn = DEFAULT_TOKEN.WSOL;
            outputToken = OUTPUT_TOKEN;
            swapAmountIn = swapAmountIn * Math.pow(10, 9);

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
            // mvxFee = new BigNumber(swapAmountIn).times(MVXBOT_FEES);
            await ctx.api.sendMessage(chatId, `💸 Buying ${originalBuyAmt} SOL of ${userTokenBalanceAndDetails.userTokenSymbol}`);
        } else {

            if (userTokenBalance == 0) {
                await ctx.api.sendMessage(chatId, `🔴 Insufficient balance. Your balance is ${userTokenBalance} ${userTokenBalanceAndDetails.userTokenSymbol}`);
                return;
            }
            let percent = swapAmountIn;
            tokenIn = OUTPUT_TOKEN;
            outputToken = DEFAULT_TOKEN.WSOL;
            let sellAmountPercent = userTokenBalance * Math.pow(10, userTokenBalanceAndDetails.decimals);
            swapAmountIn = Math.floor(sellAmountPercent * swapAmountIn / 100);
            await ctx.api.sendMessage(chatId, `💸 Selling ${percent}% ${userTokenBalanceAndDetails.userTokenSymbol}`);
        }

        const inputTokenAmount = new TokenAmount(tokenIn, Number(swapAmountIn));
        const slippage = new Percent(Math.ceil(userSlippage * 100), 10_000);
        const activeWalletIndexIdx: number = ctx.session.activeWalletIndex;
        const referralRecord = await Referrals.findOne({ referredUsers: chatId });
        let actualEarnings = referralRecord?.earnings;

        // referalRecord.earnings = updateEarnings;
        if (poolKeys) {
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
                commitment: 'processed'
            }).then(async ({ txids }) => {
                let msg = `🟢 <b>Transaction ${side.toUpperCase()}:</b> Processing with ${getPriorityFeeLabel(ctx.session.priorityFees)} priotity fee. <a href="https://solscan.io/tx/${txids[0]}">View on Solscan</a>.\n Please wait for confirmation...`
                await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
                const isConfirmed = await waitForConfirmation(ctx, txids[0]);

                if (isConfirmed) {
                    const txxs = await connection.getParsedTransaction(txids[0], { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
                    let txAmount: Array<any> | undefined;
                    let extractAmount: number | undefined;

                    let inner = JSON.parse(JSON.stringify(txxs));

                    if (txxs && txxs.meta && txxs.meta.innerInstructions && txxs.meta.innerInstructions[0].instructions) {
                        txAmount = JSON.parse(JSON.stringify(txxs.meta.innerInstructions[0].instructions));
                        txAmount = !Array.isArray(txAmount) ? [txAmount] : txAmount;
                        txAmount.forEach((tx) => {
                            console.log('TXXXXX::: ', JSON.parse(JSON.stringify(tx)));

                            if (tx.parsed.info.authority === '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1') { extractAmount = tx.parsed.info.amount; }
                        });
                    }

                    let confirmedMsg;
                    let solAmount;
                    let tokenAmount;
                    const _symbol = userTokenBalanceAndDetails.userTokenSymbol;
                    let solFromSell = new BigNumber(0);

                    if (extractAmount) {
                        solFromSell = new BigNumber(extractAmount);
                        solAmount = Number(extractAmount) / 1e9; // Convert amount to SOL
                        tokenAmount = swapAmountIn / Math.pow(10, userTokenBalanceAndDetails.decimals);
                        side == 'sell' ?
                            confirmedMsg = `✅ <b>${side.toUpperCase()} tx Confirmed:</b> You sold ${tokenAmount.toFixed(3)} <b>${_symbol}</b> for ${solAmount.toFixed(3)} <b>SOL</b>. <a href="https://solscan.io/tx/${txids[0]}">View Details</a>.` :
                            confirmedMsg = `✅ <b>${side.toUpperCase()} tx Confirmed:</b> You bought ${Number(extractAmount / Math.pow(10, userTokenBalanceAndDetails.decimals)).toFixed(4)} <b>${_symbol}</b> for ${(swapAmountIn / 1e9).toFixed(4)} <b>SOL</b>. <a href="https://solscan.io/tx/${txids[0]}">View Details</a>.`;
                    } else {
                        confirmedMsg = `✅ <b>${side.toUpperCase()} tx Confirmed:</b> Your transaction has been successfully confirmed. <a href="https://solscan.io/tx/${txids[0]}">View Details</a>.`;
                    }

                    const bot_fee = new BigNumber(solFromSell).multipliedBy(MVXBOT_FEES);
                    const referralAmmount = (bot_fee.multipliedBy(referralFee));
                    const cut_bot_fee = bot_fee.minus(referralAmmount);
                    if (side === 'sell') {
                        if (referralFee > 0) {
                            mvxFee = new BigNumber(cut_bot_fee);
                            refferalFeePay = new BigNumber(referralAmmount);
                        } else {
                            mvxFee = new BigNumber(bot_fee);
                        }
                    }
                    if (referralRecord) {
                        let updateEarnings = actualEarnings! + (refferalFeePay).toNumber();
                        referralRecord.earnings = Number(updateEarnings.toFixed(0));
                        await referralRecord?.save();
                    }

                    if (side == 'buy' && extractAmount) {
                        console.log('extractAmount', extractAmount);
                        const isFinalized = await trackUntilFinalized(ctx, txids[0]);

                        if (isFinalized) {
                            await saveUserPosition(
                                ctx,
                                userWallet.publicKey.toString(), {
                                baseMint: poolKeys.baseMint,
                                name: userTokenBalanceAndDetails.userTokenName,
                                symbol: _symbol,
                                tradeType: `ray_swap_${side}`,
                                amountIn: oldPositionSol ? oldPositionSol + swapAmountIn : swapAmountIn,
                                amountOut: oldPositionToken ? oldPositionToken + Number(extractAmount) : Number(extractAmount),
                            });
                        }
                    } else if (side == 'sell' && extractAmount) {

                        let newAmountIn, newAmountOut;
                        if (Number(swapAmountIn) === oldPositionToken || oldPositionSol <= extractAmount) {
                            newAmountIn = 0;
                            newAmountOut = 0;
                        } else {
                            newAmountIn = oldPositionSol > 0 ? oldPositionSol - extractAmount : oldPositionSol;
                            newAmountOut = oldPositionToken > 0 ? oldPositionToken - Number(swapAmountIn) : oldPositionToken;
                        }

                        await saveUserPosition(
                            ctx,
                            userWallet.publicKey.toString(), {
                            baseMint: poolKeys.baseMint,
                            name: userTokenBalanceAndDetails.userTokenName,
                            symbol: _symbol,
                            tradeType: `ray_swap_${side}`,
                            amountIn: newAmountIn,
                            amountOut: newAmountOut,
                        });
                    }
                    ctx.session.latestCommand = side;
                    await ctx.api.sendMessage(chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
                }
            }).catch(async (error: any) => {
                let msg = `🔴 ${side.toUpperCase()} Swap failed, please try again.`;
                await ctx.api.sendMessage(chatId, msg);
                console.info('error', error);
                return error;
            });
        }
    } catch (e: any) {
        let msg = `🔴 ${side.toUpperCase()} ${e.message}`
        await ctx.api.sendMessage(chatId, msg);
        console.error("ERROR on handle_radyum_trade: ", e)
    }

}