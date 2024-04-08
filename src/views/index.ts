import { PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getUserTokenBalanceAndDetails } from '../service/feeds';
import TelegramBot from 'node-telegram-bot-api';
import { quoteToken } from './util/dataCalculation';
import { getSolanaDetails } from '../api';
import { formatNumberToKOrM, getSolBalance } from '../service/util';
import { RAYDIUM_POOL_TYPE } from '../service/util/types';
import { jsonInfo2PoolKeys, Liquidity, LiquidityPoolKeys, SPL_ACCOUNT_LAYOUT, TOKEN_PROGRAM_ID, TokenAccount } from '@raydium-io/raydium-sdk';
import { Keypair, Connection } from '@solana/web3.js';
import { runHigh, runMax, runMedium, runMin } from './util/getPriority';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');

export async function handleCloseKeyboard(ctx: any) {
    const chatId = ctx.chat.id;
    const messageId = ctx.msg.message_id;
    try {
        // Delete the message with the inline keyboard
        await ctx.api.deleteMessage(chatId, messageId);
        // console.info(`Message with keyboard deleted for chatId: ${chatId}`);       
    } catch (error: any) {
        console.error(`Error in handleCloseKeyboard for chatId ${chatId}:`, error.message);
    }
}


export async function display_token_details(ctx: any) {
    const priority_Level = ctx.session.priorityFees;
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);
    let raydiumId = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
    const rayPoolKeys = ctx.session.activeTradingPool as RAYDIUM_POOL_TYPE;

    if (!rayPoolKeys) {
        // Handle the case where the pool information is not available
        await ctx.reply("Pool information not available.");
        return;
    }
    const baseVault = rayPoolKeys.baseVault;
    const quoteVault = rayPoolKeys.quoteVault;
    const baseDecimals = rayPoolKeys.baseDecimals;
    const quoteDecimals = rayPoolKeys.quoteDecimals;
    const baseMint = rayPoolKeys.baseMint;

    // console.log("rayPoolKeys",rayPoolKeys)
    const tokenAddress = new PublicKey(baseMint);
    const chatId = ctx.chat.id;
    const activeWalletIndexIdx: number = ctx.session.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
    const [tokenMetadataResult, solPrice, tokenInfo,balanceInSOL ] = await Promise.all([
        getTokenMetadata(ctx, tokenAddress.toBase58()),
        getSolanaDetails(),
        quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint, connection }),
        getSolBalance(userPublicKey,connection),

    ]);
    // console.log(tokenInfo.price.toNumber(), solPrice);

    const {
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
        tokenData,
    } = tokenMetadataResult;
    const marketCap = tokenInfo.marketCap.toNumber() * (solPrice).toFixed(2);

    async function getPriorityFees(ctx: any, raydiumId: string) {
        return await Promise.all([
            runMin(ctx, raydiumId),
            runMedium(ctx, raydiumId),
            runHigh(ctx, raydiumId),
            runMax(ctx, raydiumId),
        ]);
    }
    const formattedmac = await formatNumberToKOrM(marketCap) ?? "NA";
    const [lowPriorityFee, mediumPriorityFee, highPriorityFee, maxPriorityFee] = await getPriorityFees(ctx, raydiumId);

    const tokenPriceSOL = tokenInfo.price.toNumber().toFixed(quoteDecimals);
    const tokenPriceUSD = (Number(tokenInfo.price.toNumber()) * (solPrice)).toFixed(quoteDecimals);

    const priceImpact = tokenInfo.priceImpact.toFixed(2);
    const priceImpact_1 = tokenInfo.priceImpact_1.toFixed(2);
    const balanceInUSD = (balanceInSOL * (solPrice)).toFixed(2);
    const { userTokenBalance, decimals, userTokenSymbol } = await getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress,connection);
    try {
        // Construct the message
        let options: any;
        let messageText: any;

        if (ctx.session.latestCommand == 'buy') {
            ctx.session.currentMode = 'buy';
            messageText = `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
                `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
                `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
                `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
                `Market Cap: <b>${formattedmac} USD</b>\n` +
                `Token Price: <b> ${tokenPriceUSD} USD</b> | <b> ${tokenPriceSOL} SOL</b> \n\n` +
                // `💧 Liquidity: <b>${(formattedLiquidity)}</b>  USD\n` + 
                `Price Impact (5.0 SOL) : <b>${priceImpact}%</b>  |  (1.0 SOL): <b> ${priceImpact_1}%</b>\n\n` +
                `--<code>Priority fees</code>--\n Low: ${(Number(lowPriorityFee) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(mediumPriorityFee) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(highPriorityFee) / 1e9).toFixed(7)} <b>SOL</b>\n Max: ${(Number(maxPriorityFee) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
                `Token Balance: <b>${userTokenBalance?.toFixed(3)} $${userTokenSymbol} </b> | <b>${((userTokenBalance?.toFixed(3)) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((userTokenBalance?.toFixed(3)) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
                `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n `;

            // Define buy mode inline keyboard
            options = {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: ' 🔂 Refresh ', callback_data: 'refresh_trade' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                        [{ text: 'Buy (X SOL)', callback_data: 'buy_X_SOL' }, { text: 'Buy (1 SOL)', callback_data: 'buy_1_SOL' }, { text: 'Buy (5 SOL)', callback_data: 'buy_5_SOL' }],
                        // [{ text: '⏮️ Previous', callback_data: 'previous_token' }, { text: `${tokenData.name} (${tokenData.symbol})`, callback_data: 'current_token' }, { text: 'Next ⏭️', callback_data: 'next_token' }],
                        [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: 'Selling Mode 💸', callback_data: 'sell' }],
                        [{ text: '📈 Priority fees', callback_data: '_' }],
                        [
                            { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Medium ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },
                            { text: `High ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_high' }, { text: `Max ${priority_Level ===  10000? '✅' : ''}`, callback_data: 'priority_max' }
                        ],
                        [{ text: 'Close', callback_data: 'closing' }]]
                },
            };
        } else if (ctx.session.latestCommand == 'sell') {
            ctx.session.currentMode = 'sell';
            messageText = `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
                `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
                `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
                `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
                `Market Cap: <b>${formattedmac} USD</b>\n` +
                `Token Price: <b> ${tokenPriceUSD} USD</b> | <b> ${tokenPriceSOL} SOL</b> \n\n` +
                // `💧 Liquidity: <b>${(formattedLiquidity)}</b>  USD\n` + 
                `Price Impact (5.0 SOL) : <b>${priceImpact}%</b>  |  (1.0 SOL): <b> ${priceImpact_1}%</b>\n\n` +
                `--<code>Priority fees</code>--\n Low: ${(Number(lowPriorityFee) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(mediumPriorityFee) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(highPriorityFee) / 1e9).toFixed(7)} <b>SOL</b>\n Max: ${(Number(maxPriorityFee) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
                `Token Balance: <b>${userTokenBalance?.toFixed(3)} $${userTokenSymbol} </b> | <b>${((userTokenBalance?.toFixed(3)) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((userTokenBalance?.toFixed(3)) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
                `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n `;

            // Handle sell mode and define inline keyboard
            options = {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: ' 🔂 Refresh ', callback_data: 'refresh_trade' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                        [{ text: '  Sell 25%  ', callback_data: 'sell_25_TOKEN' },{ text: '  Sell 50%  ', callback_data: 'sell_50_TOKEN' }, { text: 'Sell 75%', callback_data: '  sell_75_TOKEN  ' },],
                        [{ text: '  Sell 100%  ', callback_data: 'sell_100_TOKEN' },{ text: '  Sell X Amount  ', callback_data: 'sell_X_TOKEN' }],
                        [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: ' Buy Mode', callback_data: 'buy' }],
                        [{ text: '📈 Priority fees', callback_data: '_' }],
                        [
                            { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Medium ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },
                            { text: `High ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_high' }, { text: `Max ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_max' }
                        ],
                        [{ text: 'Close', callback_data: 'closing' }]
                    ],
                },
            };
        }

        // Send or edit the message
        await ctx.api.sendMessage(chatId, messageText, options);
    } catch (error: any) {
        console.error('Error in getTokenMetadata:', error.message);
        ctx.api.sendMessage(chatId, "Error getting token data, verify the address..", { parse_mode: 'HTML' });
    }
}

export async function display_snipe_options(ctx: any,msgTxt?: string) {
    let messageText;
    const priority_Level = ctx.session.priorityFees;
    let raydiumId = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
    const activePool = ctx.session.activeTradingPool;
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);
    const activeWalletIndexIdx: number = ctx.session.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
    // console.log("activePool",activePool)
    if(!msgTxt && !activePool) {await ctx.api.sendMessage(ctx.chat.id, "Enter token address to snipe.", { parse_mode: 'HTML' }); return;}

    if (activePool && activePool.baseMint != DEFAULT_PUBLIC_KEY) {

        const rayPoolKeys = ctx.session.activeTradingPool as RAYDIUM_POOL_TYPE;
        const poolKeys = jsonInfo2PoolKeys(rayPoolKeys) as LiquidityPoolKeys;

        const baseVault = rayPoolKeys.baseVault;
        const quoteVault = rayPoolKeys.quoteVault;
        const baseDecimals = rayPoolKeys.baseDecimals;
        const quoteDecimals = rayPoolKeys.quoteDecimals;
        const baseMint = rayPoolKeys.baseMint;
        const chatId = ctx.chat.id;
        const tokenAddress = new PublicKey(ctx.session.snipeToken);

        const [tokenMetadataResult, solPrice, tokenInfo, liqInfo, balanceInSOL, userTokenDetails] = await Promise.all([
            getTokenMetadata(ctx, tokenAddress.toBase58()),
            getSolanaDetails(),
            quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint, connection }),
            Liquidity.fetchInfo({ connection, poolKeys }),
            getSolBalance(userPublicKey, connection),
            getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress, connection)
        ]);
   

        const {
            birdeyeURL,
            dextoolsURL,
            dexscreenerURL,
            tokenData,
        } = tokenMetadataResult;
        const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;
        const marketCap = tokenInfo.marketCap.toNumber() * (solPrice).toFixed(2);
        const formattedmac = await formatNumberToKOrM(marketCap) ?? "NA";

        async function getPriorityFees(ctx: any, raydiumId: string) {
            return await Promise.all([
                runMin(ctx, raydiumId),
                runMedium(ctx, raydiumId),
                runHigh(ctx, raydiumId),
                runMax(ctx, raydiumId)
            ]);
        }
        const [lowPriorityFee, mediumPriorityFee, highPriorityFee, maxPriorityFee] = await getPriorityFees(ctx, raydiumId);


        ctx.session.currentMode = 'snipe';
        ctx.session.poolTime = liqInfo;
        // showing the user the countdowm to the snipe
        const currentTime = new Date();
        const poolStartTime = new Date(liqInfo.startTime.toNumber() * 1000);

        let poolStatusMessage;
        if (currentTime >= poolStartTime) {
            poolStatusMessage = "✅ Opened";
        } else {
            const timeDiff = Number(poolStartTime) - Number(currentTime);
            const countdown = new Date(timeDiff).toISOString().substr(11, 8);
            poolStatusMessage = `⏳ Opening in ${countdown}`;
        }
    
        const tokenPriceSOL = tokenInfo.price.toNumber().toFixed(quoteDecimals);
        const tokenPriceUSD = (Number(tokenPriceSOL) * (solPrice)).toFixed(quoteDecimals);
 
        const priceImpact = tokenInfo.priceImpact.toFixed(2);
        const priceImpact_1 = tokenInfo.priceImpact_1.toFixed(2);


        const balanceInUSD = (balanceInSOL * (solPrice)).toFixed(2);

        messageText = `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
            `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
            `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
            `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
            `Market Cap: <b>${formattedmac} USD</b>\n` +
            `Token Price: <b> ${tokenPriceUSD} USD</b> | <b> ${tokenPriceSOL} SOL</b> \n\n` +
            // `💧 Liquidity: <b>${(formattedLiquidity)}</b>  USD\n` + 
            `price Impact (5.0 SOL) : <b>${priceImpact}%</b> | (1.0 SOL): <b>${priceImpact_1}%</b> \n\n` +
            `Pool Status: <b>${poolStatusMessage}</b>\n\n` +
            `--<code>Priority fees</code>--\n Low: ${(Number(lowPriorityFee) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(mediumPriorityFee) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(highPriorityFee) / 1e9).toFixed(7)} <b>SOL</b>\n Max: ${(Number(maxPriorityFee) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
            `Token Balance: <b>${userTokenDetails.userTokenBalance.toFixed(3)} $${userTokenDetails.userTokenSymbol} </b> | <b>${((userTokenBalance?.toFixed(3)) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((userTokenBalance?.toFixed(3)) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
            `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n `;
    } else {
        const { tokenData } = await getTokenMetadata(ctx, ctx.session.snipeToken);
        messageText = `<b>${tokenData.name} (${tokenData.symbol})</b> | 📄 CA: <code>${msgTxt}</code> <a href="copy:${msgTxt}">🅲</a>\n` +
            `No pool available for this token yet. \nSet Sniper by selecting slippage and amount.`;
     }

      await ctx.api.sendMessage(ctx.chat.id, messageText, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: [
                [{ text: ' 🔂 Refresh ', callback_data: 'refresh_snipe' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                // [{ text: ' 🎯  Turbo Snipping ', callback_data: '_' }],
                [{ text: '🎯 X SOL', callback_data: 'snipe_X_SOL' }, { text: '🎯 1 SOL', callback_data: 'snipe_1_SOL' }, { text: '🎯 5 SOL', callback_data: 'snipe_5_SOL' }],
                [{ text: `⛷️ Set Slippage (${ctx.session.snipeSlippage}%) 🖋️`, callback_data: 'set_snipe_slippage' }, { text: 'Selling Mode 💸', callback_data: 'sell' }],
                [{ text: '📈 Priority fees', callback_data: '_' }],

                [
                    { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Medium ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },
                    { text: `High ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_high' }, { text: `Max ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_max' }
                ],
                [{ text: 'Cancel', callback_data: 'closing' }]
            ]

        },
    });

}
