import { PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getUserTokenBalanceAndDetails } from '../service/feeds';
import TelegramBot from 'node-telegram-bot-api';
import { quoteToken } from './util/dataCalculation';
import { getSolanaDetails } from '../api';
import { formatNumberToKOrM, getSolBalance } from '../service/util';
import { RAYDIUM_POOL_TYPE } from '../service/util/types';
import { getRayPoolKeys } from '../service/dex/raydium/market-data/1_Geyser';
import {jsonInfo2PoolKeys, LiquidityPoolKeys} from '@raydium-io/raydium-sdk';


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


    const rayPoolKeys = ctx.session.activeTradingPool as RAYDIUM_POOL_TYPE;


    // const { baseVault, quoteVault, baseDecimals, quoteDecimals, baseMint } = ctx.session.buyTokenData;
    const baseVault = rayPoolKeys.baseVault;
    const quoteVault = rayPoolKeys.quoteVault;
    const baseDecimals = rayPoolKeys.baseDecimals;
    const quoteDecimals = rayPoolKeys.quoteDecimals;
    const baseMint = rayPoolKeys.baseMint;
    const tokenAddress = new PublicKey (baseMint);
    const chatId = ctx.chat.id;
    // const messageId = ctx.msg.message_id;
    const {
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
        tokenData,
    } = await getTokenMetadata(ctx, tokenAddress.toBase58()); // Convert tokenAddress to string using toBase58()
    const solprice = await getSolanaDetails();
  
    const tokenInfo = await quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint });
    // const formattedLiquidity = await formatNumberToKOrM(tokenInfo.liquidity * solprice * 2 ?? "N/A");
    const tokenPriceSOL = tokenInfo.price.toNumber().toFixed(quoteDecimals);
    const tokenPriceUSD = (Number(tokenPriceSOL) * (solprice)).toFixed(quoteDecimals);
    const marketCap = tokenInfo.marketCap.toNumber() * (solprice).toFixed(2);
    const formattedmac= await formatNumberToKOrM(marketCap) ?? "NA";
    const activeWalletIndexIdx: number = ctx.session.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;

    const balanceInSOL = await getSolBalance(userPublicKey);
    // console.log('userPublicKey', userPublicKey);
    const balanceInUSD = (balanceInSOL * (solprice)).toFixed(2);
    // console.log('newpublickey', new PublicKey(userPublicKey));
    const { userTokenBalance, decimals, userTokenSymbol } = await getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress);
    // console.log('userTokenBalance2', userTokenBalance);
    try {
        // Construct the message
        let options: any;
        let messageText: any;

        if (ctx.session.latestCommand == 'buy') {
            messageText = `<b>${tokenData.name} (${tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
                `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
                `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
                `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
                `🏪 Market Cap: <b>${formattedmac} USD</b>\n` +
                `💵 Token Price: <b> ${tokenPriceUSD} USD</b> | <b> ${tokenPriceSOL} SOL</b> \n` +
                // `💧 Liquidity: <b>${(formattedLiquidity)}</b>  USD\n` + 
              
                `🪙 Token Balance: <b>${userTokenBalance?.toFixed(3)} $${userTokenSymbol} </b> | <b>${((userTokenBalance?.toFixed(3)) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((userTokenBalance?.toFixed(3)) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
                `🛄 Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n ` ;
            
            // Define buy mode inline keyboard
            options = {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: ' 🔂 Refresh ', callback_data: 'refresh_trade' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                        [{ text: 'Buy (X SOL)', callback_data: 'buy_X_SOL' }, { text: 'Buy (0.1 SOL)', callback_data: 'buy_0.1_SOL' }, { text: 'Buy (0.2 SOL)', callback_data: 'buy_0.2_SOL' }],
                        [{ text: 'Buy (0.5 SOL)', callback_data: 'buy_0.5_SOL' }, { text: 'Buy (1 SOL)', callback_data: 'buy_1_SOL' }, { text: 'Buy (5 SOL)', callback_data: 'buy_5_SOL' }],
                        [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }],
                        [{ text: 'Selling Mode 💸', callback_data: 'sell' }],
                        [{ text: 'Close', callback_data: 'closing' }]],
                },
            };
        } else if (ctx.session.latestCommand == 'sell') {
            messageText = `<b>${tokenData.name} (${tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
                `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
                `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
                `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n`;
            // `💵 Token Price:<b> ${Number(tokenInfo.price).toFixed(decimals)}</b> USD\n` +
            // `💹 Market Cap: <b>${formattedmac}</b> USD\n` +
            // `💧 Liquidity: <b>${(formattedLiquidity)}</b>  USD\n` +
            // `Price Changes: 5m: <b>${tokenInfo.priceChange30mPercent.toFixed(2)}%</b>, 1h: <b>${tokenInfo.priceChange1hPercent.toFixed(2)}%</b>, 6h: <b>${tokenInfo.priceChange6hPercent.toFixed(2)}%</b>, 24h: <b>${tokenInfo.priceChange24hPercent.toFixed(2)}%</b>\n ` +
            // `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD.toFixed(3)} USD</b>\n ` +
            // `Balance: <b>${userTokenBalance?.toFixed(3)}</b> $${userTokenSymbol} | <b>${((userTokenBalance?.toFixed(3)) * ((tokenInfo.price).toFixed(decimals))).toFixed(3)}</b> USD | <b>${((userTokenBalance?.toFixed(3)) * ((tokenInfo.price).toFixed(decimals)) / solPriceInUSD).toFixed(3)}</b> SOL `;

            // Handle sell mode and define inline keyboard
            options = {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: ' 🔂 Refresh ', callback_data: 'refresh_trade' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                        [{ text: '  Sell 10%  ', callback_data: 'sell_10_TOKEN' }, { text: '  Sell 20%  ', callback_data: 'sell_20_TOKEN' }, { text: '  Sell 30%  ', callback_data: 'sell_30_TOKEN' }],
                        [{ text: '  Sell 50%  ', callback_data: 'sell_50_TOKEN' }, { text: 'Sell 75%', callback_data: '  sell_75_TOKEN  ' }, { text: '  Sell 100%  ', callback_data: 'sell_100_TOKEN' }],
                        [{ text: '  Sell X Amount  ', callback_data: 'sell_X_TOKEN' }, { text: ' Buy Mode', callback_data: 'buy' }],
                        [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }],
                        [{ text: ' Cancel ', callback_data: 'closing' }]
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

export async function display_snipe_options(ctx: any) {
    const tokenAddress = new PublicKey(ctx.session.snipeToken);
    const {
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
        tokenData,
    } = await getTokenMetadata(ctx, tokenAddress.toBase58());
    // | 📄 CA: <code>${tokenData}</code> <a href="copy:${tokenAddress}">🅲</a>\n
    const messageText = `<b>${tokenData.name} (${tokenData.symbol})</b>` +
        `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
        `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
        `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n`;
    await ctx.api.sendMessage(ctx.chat.id, messageText,{
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [{ text: ' 🔂 Refresh ', callback_data: 'refresh_trade' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                    // [{ text: ' 🎯  Turbo Snipping ', callback_data: '_' }],
                    [{ text: '🎯 X SOL', callback_data: 'snipe_X_SOL' }, { text: '🎯 0.1 SOL', callback_data: 'snipe_0.1_SOL' }, { text: '🎯 0.2 SOL', callback_data: 'snipe_0.2_SOL' }],
                    [{ text: '🎯 0.5 SOL', callback_data: 'snipe_0.5_SOL' }, { text: '🎯 1 SOL', callback_data: 'snipe_1_SOL' }, { text: '🎯 5 SOL', callback_data: 'snipe_5_SOL' }],
                    [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }],
                    [{ text: 'Selling Mode 💸', callback_data: 'sell' }],
                    [{ text: 'Close', callback_data: 'closing' }]],
            },
        });

}