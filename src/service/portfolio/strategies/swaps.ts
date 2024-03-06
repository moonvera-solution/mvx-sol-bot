import { Liquidity, LiquidityPoolKeys,Percent, jsonInfo2PoolKeys,TokenAmount,TOKEN_PROGRAM_ID,Token as RayddiumToken } from '@raydium-io/raydium-sdk';
import { PublicKey, Keypair ,} from '@solana/web3.js';
import {getWalletTokenAccount, getSolBalance} from '../../util';
import {DEFAULT_TOKEN,connection} from '../../../../config';
import {raydium_amm_swap} from '../../dex';
import {ISESSION_DATA} from '../../util/types';
import {getUserTokenBalanceAndDetails} from '../../feeds';
import bs58 from 'bs58';
import { getRayPoolKeys } from '../../../service/dex/raydium/market-data/1_Geyser';

export async function handle_radyum_swap(
    ctx:any,
    tokenOut: PublicKey,
    side: String,
    swapAmountIn:any) {
    const chatId = ctx.chat.id;
    const session : ISESSION_DATA = ctx.session;
    const userWallet = session.portfolio.wallets[session.activeWalletIndex];
    let userSlippage = session.latestSlippage;
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
                outputToken,
                targetPool: targetPoolInfo,
                inputTokenAmount,
                slippage,
                walletTokenAccounts,
                wallet: Keypair.fromSecretKey(bs58.decode(String(userSecretKey))),
                commitment: 'processed'
            }).then(async ({ txids }) => {
                let msg = `🟢 ${side.toUpperCase()} <a href="https://solscan.io/tx/${txids[0]}">transaction</a> sent.`
                await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
    
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
