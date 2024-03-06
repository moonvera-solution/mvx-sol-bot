import { PublicKey } from '@solana/web3.js';
import {getTokenMetadata, getUserTokenBalanceAndDetails} from '../../service/feeds'
import TelegramBot from 'node-telegram-bot-api';


export async function refreshTokenDetails(ctx: any) {
    const tokenAddress : PublicKey= ctx.session.activeTradingPool.baseMint;
    const {
        tokenInfo,
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
        formattedLiquidity,
        formattedmac,
        solPriceInUSD,
        balanceInSOL,
        balanceInUSD,
    } = await getTokenMetadata(ctx,tokenAddress.toBase58());
    
    const activeWalletIndexIdx: number = ctx.session.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;

    const {
        userTokenBalance,
        decimals,
        userTokenSymbol,
    } = await getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress);
    console.log('userTokenBalance',userTokenBalance)
    try {
       

        // Construct the message
        let messageText: any;
        let options: any;
        if (ctx.session.latestCommand == 'buy') {
         
            // Append balance information to message
            messageText = `<b>${tokenInfo.name} (${tokenInfo.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
                `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
                `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
                `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
                // `💵 Token Price:<b> ${Number(tokenInfo.price).toFixed(decimals)}</b> $USD\n` +
                // `💹 Market Cap: <b>${formattedmac}</b> $USD\n` +
                // `Price Changes: 5m: <b>${tokenInfo.priceChange30mPercent.toFixed(2)}%</b>, 1h: <b>${tokenInfo.priceChange1hPercent.toFixed(2)}%</b>, 6h: <b>${tokenInfo.priceChange6hPercent.toFixed(2)}%</b>, 24h: <b>${tokenInfo.priceChange24hPercent.toFixed(2)}%</b>\n ` +
                '_________________________________________________________________________\n' ;
                // `Wallet Balance: <b>${balanceInSOL.toFixed(3)} $SOL</b> | <b>${balanceInUSD.toFixed(3)} $USD</b>\n ` +
                // `Balance: <b>${userTokenBalance?.toFixed(3)}</b> $${userTokenSymbol} | <b>${((userTokenBalance?.toFixed(3)) * ((tokenInfo.price).toFixed(decimals))).toFixed(3)}</b> $USD | <b>${((userTokenBalance?.toFixed(3)) * ((tokenInfo.price).toFixed(decimals)) / solPriceInUSD).toFixed(3)}</b> $SOL `;

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
            messageText = `<b>${tokenInfo.name} (${tokenInfo.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
                `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
                `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
                `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
                // `💵 Token Price:<b> ${Number(tokenInfo.price).toFixed(decimals)}</b> $USD\n` +
                // `💹 Market Cap: <b>${formattedmac}</b> $USD\n` +
                // `Price Changes: 5m: <b>${tokenInfo.priceChange30mPercent.toFixed(2)}%</b>, 1h: <b>${tokenInfo.priceChange1hPercent.toFixed(2)}%</b>, 6h: <b>${tokenInfo.priceChange6hPercent.toFixed(2)}%</b>, 24h: <b>${tokenInfo.priceChange24hPercent.toFixed(2)}%</b>\n ` +
                '_________________________________________________________________________\n' ;
                //  `Wallet Balance: <b>${balanceInSOL.toFixed(3)} $SOL</b> | <b>${balanceInUSD.toFixed(3)} $USD</b>\n ` +
                // `Balance: <b>${userTokenBalance?.toFixed(3)}</b> $${userTokenSymbol} | <b>${((userTokenBalance?.toFixed(3)) * ((tokenInfo.price).toFixed(decimals))).toFixed(3)}</b> $USD | <b>${((userTokenBalance?.toFixed(3)) * ((tokenInfo.price).toFixed(decimals)) / solPriceInUSD).toFixed(3)}</b> $SOL `;

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

        await ctx.editMessageText( messageText, options);

    } catch (error: any) {
        console.error('Error in getTokenMetadata:', error.message);
    }
}