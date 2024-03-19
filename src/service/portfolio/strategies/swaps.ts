import { Liquidity, LiquidityPoolKeys, Percent, jsonInfo2PoolKeys, TokenAmount, TOKEN_PROGRAM_ID, Token as RayddiumToken } from '@raydium-io/raydium-sdk';
import { PublicKey, Keypair, } from '@solana/web3.js';
import { getWalletTokenAccount, getSolBalance,waitForConfirmation } from '../../util';
import { DEFAULT_TOKEN, MVXBOT_FEES, connection } from '../../../../config';
import { getUserTokenBalanceAndDetails } from '../../feeds';
import { display_token_details } from '../../../views';
import { ISESSION_DATA } from '../../util/types';
import { saveUserPosition } from "../positions";
import { raydium_amm_swap } from '../../dex';
import BigNumber from 'bignumber.js';
import axios from 'axios';
import bs58 from 'bs58';


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
    try {
        const userTokenBalanceAndDetails = await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut));
        const poolKeys = ctx.session.activeTradingPool;

        const OUTPUT_TOKEN = new RayddiumToken(TOKEN_PROGRAM_ID, tokenOut, userTokenBalanceAndDetails.decimals);
        const walletTokenAccounts = await getWalletTokenAccount(connection, new PublicKey(userWallet.publicKey!));
        let userSolBalance = await getSolBalance(userWallet.publicKey);
        let userTokenBalance = userTokenBalanceAndDetails.userTokenBalance;
        let tokenIn, outputToken;
        if (side == 'buy') {
            let originalBuyAmt = swapAmountIn;
            if (userSolBalance == 0 || userSolBalance < swapAmountIn) {
                await ctx.api.sendMessage(chatId, `Insufficient balance. Your balance is ${userSolBalance} SOL`);
                return;
            }
            tokenIn = DEFAULT_TOKEN.WSOL;
            outputToken = OUTPUT_TOKEN;
            swapAmountIn = swapAmountIn * Math.pow(10, 9);
            mvxFee = new BigNumber(swapAmountIn).times(MVXBOT_FEES);
            await ctx.api.sendMessage(chatId, `💸 Buying ${originalBuyAmt} SOL of ${userTokenBalanceAndDetails.userTokenSymbol}`);
        } else {
            if (userTokenBalance == 0) {
                await ctx.api.sendMessage(chatId, `Insufficient balance. Your balance is ${userTokenBalance} ${userTokenBalanceAndDetails.userTokenSymbol}`);
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

        if (poolKeys) {
            raydium_amm_swap({
                side,
                mvxFee,
                outputToken,
                targetPool: poolKeys.id, // ammId
                inputTokenAmount,
                slippage,
                walletTokenAccounts,
                wallet: Keypair.fromSecretKey(bs58.decode(String(userWallet.secretKey))),
                commitment: 'processed'
            }).then(async ({ txids }) => {
                let msg = `🟢 <b>Transaction ${side.toUpperCase()}:</b> Processed successfully. <a href="https://solscan.io/tx/${txids[0]}">View on Solscan</a>.`
                await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
                const isConfirmed = await waitForConfirmation(txids[0]);

                if (isConfirmed) {
                    const txxs = await connection.getParsedTransaction(txids[0], { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
                    const txAmount = JSON.parse(JSON.stringify(txxs!.meta!.innerInstructions![0].instructions));
                    let extractAmount;
                    if (Array.isArray(txAmount)) {
                        txAmount.forEach((tx) => {
                            if (tx.parsed.info.authority === '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1') {
                                extractAmount = tx.parsed.info.amount;
                            }
                        });
                    }

                    let confirmedMsg;
                    let solAmount;
                    let tokenAmount;
                    const _symbol = userTokenBalanceAndDetails.userTokenSymbol;

                    if (extractAmount) {
                        solAmount = Number(extractAmount) / 1e9; // Convert amount to SOL
                        tokenAmount = swapAmountIn / Math.pow(10, userTokenBalanceAndDetails.decimals);
                        const _side = side === 'sell' ? 'sold' : 'bought';
                        confirmedMsg = `✅ <b>${side.toUpperCase()} tx Confirmed:</b> You ${_side} ${tokenAmount.toFixed(3)} <b>${_symbol}</b> for ${solAmount} <b>SOL</b>. <a href="https://solscan.io/tx/${txids[0]}">View Details</a>.`;
                    } else {
                        confirmedMsg = `✅ <b>${side.toUpperCase()} tx Confirmed:</b> Your transaction has been successfully confirmed. <a href="https://solscan.io/tx/${txids[0]}">View Details</a>.`;
                    }

                    if (side.includes('buy')) {
                        saveUserPosition(
                            userWallet.publicKey.toString(), {
                            baseMint: poolKeys.baseMint,
                            symbol: _symbol,
                            tradeType: `ray_swap_${side}`,
                            amountIn: swapAmountIn,
                            amountOut: extractAmount && tokenAmount,
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
