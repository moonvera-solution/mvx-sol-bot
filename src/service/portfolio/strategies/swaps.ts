import { Liquidity, LiquidityPoolKeys,Percent, jsonInfo2PoolKeys,TokenAmount,TOKEN_PROGRAM_ID,Token as RayddiumToken } from '@raydium-io/raydium-sdk';
import { PublicKey, Keypair ,} from '@solana/web3.js';
import {getWalletTokenAccount, getSolBalance} from '../../util';
import {DEFAULT_TOKEN,MVXBOT_FEES,connection} from '../../../../config';
import {raydium_amm_swap} from '../../dex';
import {ISESSION_DATA} from '../../util/types';
import {getUserTokenBalanceAndDetails} from '../../feeds';
import bs58 from 'bs58';
import { getRayPoolKeys } from '../../../service/dex/raydium/market-data/1_Geyser';
import BigNumber from 'bignumber.js';
import { display_token_details } from '../../../views';

export async function handle_radyum_swap(
    ctx:any,
    tokenOut: PublicKey,
    side: 'buy' | 'sell',
    swapAmountIn:any) {
    const chatId = ctx.chat.id;
    const session : ISESSION_DATA = ctx.session;
    const userWallet = session.portfolio.wallets[session.activeWalletIndex];
    let userSlippage = session.latestSlippage;
    let mvxFee = new BigNumber(0);
    try {
        const userTokenBalanceAndDetails = await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut));
        const targetPoolInfo = ctx.session.activeTradingPool.id;
        // console.log('targetPoolInfo', targetPoolInfo);
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
        let userSecretKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].secretKey;

        if (targetPoolInfo) {
            raydium_amm_swap({
                side,
                mvxFee,
                outputToken,
                targetPool: targetPoolInfo,
                inputTokenAmount,
                slippage,
                walletTokenAccounts,
                wallet: Keypair.fromSecretKey(bs58.decode(String(userSecretKey))),
                commitment: 'processed'
            }).then(async ({ txids }) => {
                let msg = `🟢 <b>Transaction ${side.toUpperCase()}:</b> Processed successfully. <a href="https://solscan.io/tx/${txids[0]}">View on Solscan</a>.`
                await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
                
                const isConfirmed = await waitForConfirmation(txids[0]);
                console.log('isConfirmed', isConfirmed);
                if (isConfirmed) {
                    let confirmedMsg = `✅ <b>Transaction ${side.toUpperCase()} Confirmed:</b> Your transaction has been successfully confirmed. <a href="https://solscan.io/tx/${txids[0]}">View Details</a>.`
                    await ctx.api.sendMessage(chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
                    if (side === 'buy') {
                        ctx.session.latestCommand = 'sell';
                        await display_token_details(ctx); // Trigger the function to display sell options
                    } else if (side === 'sell') {
                        ctx.session.latestCommand = 'buy';
                        await display_token_details(ctx); // Trigger the function to display buy options
                    }
                }

            }).catch(async (error: any) => {
                let msg = `🔴 ${side.toUpperCase()} busy Network, try again.`
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

async function waitForConfirmation(txid: string): Promise<boolean> {
    let isConfirmed = false;
    const maxAttempts = 100;
    let attempts = 0;

    while (!isConfirmed && attempts < maxAttempts) {
        attempts++;
        console.log(`Attempt ${attempts}/${maxAttempts} to confirm transaction`);
        
        const status = await getTransactionStatus(txid);
        console.log('Transaction status:', status);
        
        if (status === 'confirmed' || status === 'finalized') {
            console.log('Transaction is confirmed.');
            isConfirmed = true;
        } else {
            console.log('Waiting for confirmation...');
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    if (!isConfirmed) {
        console.log('Transaction could not be confirmed within the max attempts.');
    }

    return isConfirmed;
}


const fetch = require('node-fetch'); // Make sure to have 'node-fetch' installed

async function getTransactionStatus(txid: string) {
    const method = 'getSignatureStatuses';
    const solanaRpcUrl = 'https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41'; // Replace with your RPC URL
    const body = JSON.stringify({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": [
            [txid],
            { "searchTransactionHistory": true }
        ]
    });

    try {
        const response = await fetch(solanaRpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
        });

        const data = await response.json();

        // Check if the transaction is confirmed
        if (data.result && data.result.value && data.result.value[0]) {
            return data.result.value[0].confirmationStatus;
        } else {
            return 'unconfirmed'; // or some other default status
        }
    } catch (error) {
        console.error("Error fetching transaction status:", error);
        return false;
    }
}

