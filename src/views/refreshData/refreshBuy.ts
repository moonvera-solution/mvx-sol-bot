import { PublicKey } from '@solana/web3.js';
import {getTokenMetadata, getUserTokenBalanceAndDetails} from '../../service/feeds'
import TelegramBot from 'node-telegram-bot-api';
import { RAYDIUM_POOL_TYPE } from '../../service/util/types';
import { getSolanaDetails } from '../../api/priceFeeds/coinMarket';
import { quoteToken } from '../util/dataCalculation';
import { formatNumberToKOrM, getSolBalance } from '../../service/util';


export async function refreshTokenDetails(ctx: any) {
    const rayPoolKeys = ctx.session.activeTradingPool as RAYDIUM_POOL_TYPE;


    // const { baseVault, quoteVault, baseDecimals, quoteDecimals, baseMint } = ctx.session.buyTokenData;
    const baseVault = rayPoolKeys.baseVault;
    const quoteVault = rayPoolKeys.quoteVault;
    const baseDecimals = rayPoolKeys.baseDecimals;
    const quoteDecimals = rayPoolKeys.quoteDecimals;
    const baseMint = rayPoolKeys.baseMint;
    const tokenAddress = new PublicKey (baseMint);
    
    const chatId = ctx.chat.id;
    // console.log('tokenAddress', tokenAddress);
    // const messageId = ctx.msg.message_id;
    const {
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
        tokenData,
    } = await getTokenMetadata(ctx, tokenAddress.toBase58()); // Convert tokenAddress to string using toBase58()
    const solprice = await getSolanaDetails();
  
    const tokenInfo = await quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint });
    const priceImpact_1 = tokenInfo.priceImpact_1.toFixed(2);
    const tokenPriceSOL = tokenInfo.price.toNumber().toFixed(quoteDecimals);
    const tokenPriceUSD = (Number(tokenPriceSOL) * (solprice)).toFixed(quoteDecimals);
    const marketCap = tokenInfo.marketCap.toNumber() * (solprice).toFixed(2);
    const formattedmac= await formatNumberToKOrM(marketCap) ?? "NA";
    const activeWalletIndexIdx: number = ctx.session.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;

    const balanceInSOL = await getSolBalance(userPublicKey);
    const balanceInUSD = (balanceInSOL * (solprice)).toFixed(2);
    const priceImpact = tokenInfo.priceImpact.toFixed(2);
    // console.log('newpublickey', new PublicKey(userPublicKey));
    const { userTokenBalance, decimals, userTokenSymbol } = await getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress);
    let slippage = ctx.session.latestSlippage;
    try {
        // Construct the message
        let options: any;
        let messageText: any;
        if (ctx.session.latestCommand == 'buy') {
            messageText = `<b>${tokenData.name} (${tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
                `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
                `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
                `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
                `Market Cap: <b>${formattedmac} USD</b>\n` +
                `Token Price: <b> ${tokenPriceUSD} USD</b> | <b> ${tokenPriceSOL} SOL</b> \n\n` +
                // `💧 Liquidity: <b>${(formattedLiquidity)}</b>  USD\n` + 
                `Price Impact (5.0 SOL) : <b>${priceImpact}%</b>  |  (1.0 SOL): <b> ${priceImpact_1}%</b>\n\n` +
                `Token Balance: <b>${userTokenBalance?.toFixed(3)} $${userTokenSymbol} </b> | <b>${((userTokenBalance?.toFixed(3)) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((userTokenBalance?.toFixed(3)) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
                `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n ` ;
            
            // Define buy mode inline keyboard
            options = {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: ' 🔂 Refresh ', callback_data: 'refresh_trade' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                        [{ text: 'Buy (X SOL)', callback_data: 'buy_X_SOL' }, { text: 'Buy (0.1 SOL)', callback_data: 'buy_0.1_SOL' }, { text: 'Buy (0.2 SOL)', callback_data: 'buy_0.2_SOL' }],
                        [{ text: 'Buy (0.5 SOL)', callback_data: 'buy_0.5_SOL' }, { text: 'Buy (1 SOL)', callback_data: 'buy_1_SOL' }, { text: 'Buy (5 SOL)', callback_data: 'buy_5_SOL' }],
                        [{ text: '⏮️ Previous', callback_data: 'previous_token' }, { text: `${tokenData.name} (${tokenData.symbol})`, callback_data: 'current_token' }, { text: 'Next ⏭️', callback_data: 'next_token' }],
                        [{ text: `⛷️ Set Slippage (${slippage}%) 🖋️`, callback_data: 'set_slippage' },{ text: 'Selling Mode 💸', callback_data: 'sell' }],
                        [{ text: 'Close', callback_data: 'closing' }]],
                },
            };
        } else if (ctx.session.latestCommand == 'sell') {
            messageText = `<b>${tokenData.name} (${tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
            `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
            `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
            `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
            `Market Cap: <b>${formattedmac} USD</b>\n` +
            `Token Price: <b> ${tokenPriceUSD} USD</b> | <b> ${tokenPriceSOL} SOL</b> \n\n` +
            // `💧 Liquidity: <b>${(formattedLiquidity)}</b>  USD\n` + 
            `Price Impact (5.0 SOL) : <b>${priceImpact}%</b>  |  (1.0 SOL): <b> ${priceImpact_1}%</b>\n\n` +
            `Token Balance: <b>${userTokenBalance?.toFixed(3)} $${userTokenSymbol} </b> | <b>${((userTokenBalance?.toFixed(3)) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((userTokenBalance?.toFixed(3)) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
            `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n ` ;
        
            // Handle sell mode and define inline keyboard
            options = {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: ' 🔂 Refresh ', callback_data: 'refresh_trade' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                        [{ text: '  Sell X Amount  ', callback_data: 'sell_X_TOKEN' },{ text: '  Sell 10%  ', callback_data: 'sell_10_TOKEN' }, { text: '  Sell 25%  ', callback_data: 'sell_25_TOKEN' }],
                        [{ text: '  Sell 50%  ', callback_data: 'sell_50_TOKEN' }, { text: 'Sell 75%', callback_data: '  sell_75_TOKEN  ' }, { text: '  Sell 100%  ', callback_data: 'sell_100_TOKEN' }],
                        [{ text: '⏮️ Previous', callback_data: 'previous_token' }, { text: `${tokenData.name} (${tokenData.symbol})`, callback_data: 'current_token' }, { text: 'Next ⏭️', callback_data: 'next_token' }],
                        [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: ' Buy Mode', callback_data: 'buy' }],
                        [{ text: 'Close', callback_data: 'closing' }]
                    ],
                },
            };
        }

        // Send or edit the message
        await ctx.editMessageText(messageText, options);
    } catch (error: any) {
        console.error('Error in getTokenMetadata:', error.message);
    }
}