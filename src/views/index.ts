import { PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getUserTokenBalanceAndDetails } from '../service/feeds';
import { quoteToken } from './util/dataCalculation';
import { getSolanaDetails } from '../api';
import { formatNumberToKOrM, getSolBalance } from '../service/util';
import { RAYDIUM_POOL_TYPE } from '../service/util/types';
import { Keypair, Connection } from '@solana/web3.js';
import { runAllFees} from './util/getPriority';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { logErrorToFile } from "../../error/logger";
import { UserPositions } from '../db';
import { getTokenDataFromBirdEye } from '../api/priceFeeds/birdEye';

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


export async function display_token_details(ctx: any, isRefresh: boolean) {
    const priority_Level = ctx.session.priorityFees;
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
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
    const tokenAddress = new PublicKey(baseMint);
    const chatId = ctx.chat.id;
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
    const [
        birdeyeData,
        tokenMetadataResult,
        // solPrice,
        tokenInfo,
        balanceInSOL,
        userPosition,
        userTokenDetails,
        AllpriorityFees,

    ] = await Promise.all([
        getTokenDataFromBirdEye(tokenAddress.toString()),
        getTokenMetadata(ctx, tokenAddress.toBase58()),
        // getSolanaDetails(),
        quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint, connection }),
        getSolBalance(userPublicKey, connection),
        UserPositions.find({ positionChatId: chatId, walletId: userPublicKey }, { positions: { $slice: -7 } }),
        getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress, connection),
        runAllFees(ctx, raydiumId),
    ]);
    const lowpriorityFees = (AllpriorityFees.result);
    const mediumpriorityFees = (AllpriorityFees.result2);
    const highpriorityFees = (AllpriorityFees.result3);
    const maxpriorityFees = (AllpriorityFees.result4);
    const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.data.value : 0;

    const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;
    const tokenPriceUSD = birdeyeData 
    
    && birdeyeData.response 
    && birdeyeData.response.data 
    && birdeyeData.response.data.data 
    && birdeyeData.response.data.data.price != null  // This checks for both null and undefined
        ? birdeyeData.response.data.data.price 
        : tokenInfo.price.times(solPrice).toNumber();
    const tokenPriceSOL = birdeyeData ? (tokenPriceUSD / solPrice) : tokenInfo.price.toNumber();
 let specificPosition;
    if(userPosition[0] && userPosition[0].positions && userPosition[0].positions != undefined){
        specificPosition = userPosition[0].positions.find((pos: any) => new PublicKey(pos.baseMint).equals(tokenAddress));

    }
    let initialInUSD = 0;
    let initialInSOL = 0;
    let valueInUSD: any ;
    let valueInSOL: any ;
    let profitPercentage ;
    let profitInUSD ;
    let profitInSol ;
    if(specificPosition && specificPosition.amountOut ){
        valueInUSD = (specificPosition.amountOut - (userTokenDetails.userTokenBalance *  Math.pow(10,baseDecimals) )) < 5 ? userTokenDetails.userTokenBalance * Number(tokenPriceUSD) : 'N/A';
        valueInSOL = (specificPosition.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10,baseDecimals))) < 5 ? Number(((userTokenDetails.userTokenBalance)) * Number(tokenPriceSOL)) : 'N/A';
        initialInSOL = Number(specificPosition.amountIn) / 1e9;
        initialInUSD =  initialInSOL * Number(solPrice);
        profitPercentage = valueInSOL != 'N/A' ? (Number(valueInSOL) - (Number(specificPosition.amountIn) / 1e9 )) / (Number(specificPosition.amountIn) / 1e9) * 100 : 'N/A';
        profitInUSD = valueInUSD != 'N/A' ? Number(Number(userTokenDetails.userTokenBalance) * Number(tokenPriceUSD)) - initialInUSD : 'N/A';
        profitInSol = valueInSOL != 'N/A' ? (valueInSOL - initialInSOL).toFixed(4) : 'N/A';
       }

    const {
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
        tokenData,
    } = tokenMetadataResult;
    const marketCap =  birdeyeData?.response.data.data.mc? birdeyeData.response.data.data.mc : tokenInfo.marketCap.toNumber() * Number(solPrice);
    try {

         const formattedmac = await formatNumberToKOrM(marketCap) ?? "NA";

        const priceImpact = tokenInfo.priceImpact.toFixed(2);
        const priceImpact_1 = tokenInfo.priceImpact_1.toFixed(2);
        const balanceInUSD = (balanceInSOL * (solPrice)).toFixed(2);
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
                `Token Price: <b> ${tokenPriceUSD.toFixed(9)} USD</b> | <b> ${tokenPriceSOL.toFixed(9)} SOL</b> \n\n` +
                `---<code>Trade Position</code>---\n` +
                `Initial : <b>${(initialInSOL).toFixed(4)} SOL</b> | <b>${(initialInUSD.toFixed(4))} USD</b>\n` +
                `Profit: ${profitInSol != 'N/A' ? Number(profitInSol).toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD != 'N/A' ? Number(profitInUSD).toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage != 'N/A' ? Number(profitPercentage).toFixed(2) : 'N/A'}%\n` +
                `Token Balance: <b>${userTokenBalance.toFixed(3)} $${userTokenSymbol} </b> | <b>${((userTokenBalance) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
                `Price Impact (5.0 SOL) : <b>${priceImpact}%</b>  |  (1.0 SOL): <b> ${priceImpact_1}%</b>\n\n` +
                `--<code>Priority fees</code>--\n Low: ${(Number(lowpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(mediumpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(highpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Max: ${(Number(maxpriorityFees) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
                `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n `;



            // Define buy mode inline keyboard
            options = {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: ' 🔂 Refresh ', callback_data: 'refresh_trade' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                        [{ text: 'Buy (X SOL)', callback_data: 'buy_X_SOL' }, { text: 'Buy (0.5 SOL)', callback_data: 'buy_0.5_SOL' }, { text: 'Buy (1 SOL)', callback_data: 'buy_1_SOL' }],
                        // [{ text: '⏮️ Previous', callback_data: 'previous_token' }, { text: `${tokenData.name} (${tokenData.symbol})`, callback_data: 'current_token' }, { text: 'Next ⏭️', callback_data: 'next_token' }],
                        [{ text: '📈 Priority fees', callback_data: '_' }],
                        [
                            { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Med ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },
                            { text: `High ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_high' }, { text: `Max ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_max' }
                        ],
                        [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' },{ text: 'Close', callback_data: 'closing' }]]
                },
            };
        } else if (ctx.session.latestCommand == 'sell') {
            ctx.session.currentMode = 'sell';
            messageText = `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
                `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
                `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
                `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
                `Market Cap: <b>${formattedmac} USD</b>\n` +
                `Token Price: <b> ${tokenPriceUSD.toFixed(9)} USD</b> | <b> ${tokenPriceSOL.toFixed(9)} SOL</b> \n\n` +
                `---<code>Trade Position</code>---\n` +
                `Initial : <b>${(initialInSOL).toFixed(3)} SOL</b> | <b>${(initialInUSD.toFixed(3))} USD</b>\n` +
                `Profit: ${profitInSol != 'N/A' ? Number(profitInSol).toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD != 'N/A' ? Number(profitInUSD).toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage != 'N/A' ? Number(profitPercentage).toFixed(2) : 'N/A'}%\n` +
                `Token Balance: <b>${userTokenBalance.toFixed(3)} $${userTokenSymbol} </b> | <b>${((userTokenBalance) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
                `Price Impact (5.0 SOL) : <b>${priceImpact}%</b>  |  (1.0 SOL): <b> ${priceImpact_1}%</b>\n\n` +
                `--<code>Priority fees</code>--\n Low: ${(Number(lowpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(mediumpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(highpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Max: ${(Number(maxpriorityFees) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
                `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n`;

            // Handle sell mode and define inline keyboard
            options = {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: ' 🔂 Refresh ', callback_data: 'refresh_trade' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                        [{ text: '  Sell 25%  ', callback_data: 'sell_25_TOKEN' }, { text: '  Sell 50%  ', callback_data: 'sell_50_TOKEN' }, { text: 'Sell 75%', callback_data: '  sell_75_TOKEN  ' },],
                        [{ text: '  Sell 100%  ', callback_data: 'sell_100_TOKEN' }, { text: '  Sell X Amount  ', callback_data: 'sell_X_TOKEN' }],
                        [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: ' Buy Mode', callback_data: 'buy' }],
                        [{ text: '📈 Priority fees', callback_data: '_' }],
                        [
                            { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Med ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },
                            { text: `High ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_high' }, { text: `Max ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_max' }
                        ],
                        [{ text: 'Close', callback_data: 'closing' }]
                    ],
                },
            };
        }

        // Send or edit the message
        if(isRefresh){
            await ctx.editMessageText(messageText, options);
        }else{
            await ctx.api.sendMessage(chatId, messageText, options);

        }
    } catch (error: any) {
        console.error('Error in getTokenMetadata:', error.message);
        ctx.api.sendMessage(chatId, "Error getting token data, verify the address..", { parse_mode: 'HTML' });
    }
}

export async function display_snipe_options(ctx: any, isRefresh: boolean, msgTxt?: string) {
    try {
        let messageText;
        const priority_Level = ctx.session.priorityFees;
        let raydiumId = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
        const activePool = ctx.session.activeTradingPool;
        const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
        const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
        const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
        // console.log("activePool",activePool)
        if (!msgTxt && !activePool) { await ctx.api.sendMessage(ctx.chat.id, "Enter token address to snipe.", { parse_mode: 'HTML' }); return; }
    
        if (activePool && activePool.baseMint != DEFAULT_PUBLIC_KEY) {
    
            const rayPoolKeys: RAYDIUM_POOL_TYPE = ctx.session.activeTradingPool;
    
            const baseVault = rayPoolKeys.baseVault;
            const quoteVault = rayPoolKeys.quoteVault;
            const baseDecimals = rayPoolKeys.baseDecimals;
            const quoteDecimals = rayPoolKeys.quoteDecimals;
            const baseMint = rayPoolKeys.baseMint;
            const chatId = ctx.chat.id;
            const tokenAddress = new PublicKey(ctx.session.snipeToken);
    
            const liqInfo = ctx.session.poolSchedule;
            const [
                birdeyeData,
                tokenMetadataResult,
                // solPrice,
                tokenInfo,
                balanceInSOL,
                userTokenDetails,
                AllpriorityFees,

            ] = await Promise.all([
                getTokenDataFromBirdEye(tokenAddress.toString()),
                getTokenMetadata(ctx, tokenAddress.toBase58()),
                // getSolanaDetails(),
                quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint, connection }),
                getSolBalance(userPublicKey, connection),
                getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress, connection),
                runAllFees(ctx, raydiumId),

            ]);
            const lowpriorityFees = (AllpriorityFees.result);
            const mediumpriorityFees = (AllpriorityFees.result2);
            const highpriorityFees = (AllpriorityFees.result3);
            const maxpriorityFees = (AllpriorityFees.result4);
            const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.data.value : 0;

    
            const {
                birdeyeURL,
                dextoolsURL,
                dexscreenerURL,
                tokenData,
            } = tokenMetadataResult;
            const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;
            const marketCap =  birdeyeData?.response.data.data.mc? birdeyeData.response.data.data.mc : tokenInfo.marketCap.toNumber() * (solPrice).toFixed(2);
            const formattedmac = await formatNumberToKOrM(marketCap) ?? "NA";
    
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
            console.log('(tokenInfo.price.times(solPrice)',(tokenInfo.price.times(solPrice).toNumber()));
            const tokenPriceUSD = birdeyeData 
            && birdeyeData.response 
            && birdeyeData.response.data 
            && birdeyeData.response.data.data 
            && birdeyeData.response.data.data.price != null  // This checks for both null and undefined
                ? birdeyeData.response.data.data.price 
                : tokenInfo.price.times(solPrice).toNumber();
            const tokenPriceSOL = birdeyeData ? (tokenPriceUSD / solPrice) : tokenInfo.price.toNumber();

            const priceImpact = tokenInfo.priceImpact.toFixed(2);
            const priceImpact_1 = tokenInfo.priceImpact_1.toFixed(2);
    
    
            const balanceInUSD = (balanceInSOL * (solPrice)).toFixed(2);
    
            messageText = `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
                `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
                `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
                `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
                `Market Cap: <b>${formattedmac} USD</b>\n` +
                `Token Price: <b> ${tokenPriceUSD.toFixed(9)} USD</b> | <b> ${tokenPriceSOL.toFixed(9)} SOL</b> \n\n` +
                // `💧 Liquidity: <b>${(formattedLiquidity)}</b>  USD\n` + 
                `price Impact (5.0 SOL) : <b>${priceImpact}%</b> | (1.0 SOL): <b>${priceImpact_1}%</b> \n\n` +
                `Pool Status: <b>${poolStatusMessage}</b>\n\n` +
                `--<code>Priority fees</code>--\n Low: ${(Number(lowpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(mediumpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(highpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Max: ${(Number(maxpriorityFees) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
                `Token Balance: <b>${userTokenBalance.toFixed(3)} $${userTokenSymbol} </b> | <b>${((userTokenBalance) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
                `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n `;
        } else {
            ctx.session.snipeToken = ctx.session.snipeToken instanceof PublicKey ? ctx.session.snipeToken.toBase58() : ctx.session.snipeToken;
            const { tokenData } = await getTokenMetadata(ctx, ctx.session.snipeToken);
            messageText = `<b>${tokenData.name} (${tokenData.symbol})</b> | 📄 CA: <code>${msgTxt}</code> <a href="copy:${msgTxt}">🅲</a>\n` +
                `No pool available for this token yet. \nSet Sniper by selecting slippage and amount.`;
        }
        if(isRefresh){
            await ctx.editMessageText(messageText, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: ' 🔂 Refresh ', callback_data: 'refresh_snipe' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                        [{ text: `⛷️ Set snipe slippage (${ctx.session.snipeSlippage}%) 🖋️`, callback_data: 'set_snipe_slippage' }],
                        [{ text: '🎯 X SOL', callback_data: 'snipe_X_SOL' }, { text: '🎯 0.5 SOL', callback_data: 'snipe_0.5_SOL' }, { text: '🎯 1 SOL', callback_data: 'snipe_1_SOL' }],
                        [{ text: '📈 Priority fees', callback_data: '_' }],
                        [
                            { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Med ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },
                            { text: `High ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_high' }, { text: `Max ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_max' }
                        ],
                        [{ text: 'Cancel', callback_data: 'closing' }]
                    ]
        
                },
            });
        }else{
        await ctx.api.sendMessage(ctx.chat.id, messageText, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [{ text: ' 🔂 Refresh ', callback_data: 'refresh_snipe' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                    [{ text: `⛷️ Set snipe slippage (${ctx.session.snipeSlippage}%) 🖋️`, callback_data: 'set_snipe_slippage' }],
                    [{ text: '🎯 X SOL', callback_data: 'snipe_X_SOL' }, { text: '🎯 0.5 SOL', callback_data: 'snipe_0.5_SOL' }, { text: '🎯 1 SOL', callback_data: 'snipe_1_SOL' }],
                    [{ text: '📈 Priority fees', callback_data: '_' }],
                    [
                        { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Med ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },
                        { text: `High ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_high' }, { text: `Max ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_max' }
                    ],
                    [{ text: 'Cancel', callback_data: 'closing' }]
                ]
    
            },
        });
    }
    }catch (error: any) {
        console.log('display_snipe_options:',error);
        logErrorToFile("display_snipe_options", error);
    }
}

export async function display_after_Snipe_Buy(ctx: any, isRefresh: boolean) {
    const priority_Level = ctx.session.priorityFees;
    const chatId = ctx.chat.id;
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
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
   
    const [
        birdeyeData,
        tokenMetadataResult,
        // solPrice,
        tokenInfo,
        balanceInSOL,
        userPosition,
        userTokenDetails,
        AllpriorityFees,
    ] = await Promise.all([
        getTokenDataFromBirdEye(tokenAddress.toString()),
        getTokenMetadata(ctx, tokenAddress.toBase58()),
        quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint, connection }),
        getSolBalance(userPublicKey, connection),
        UserPositions.find({ positionChatId: chatId, walletId: userPublicKey }, { positions: { $slice: -7 } }),
        getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress, connection),
        runAllFees(ctx, raydiumId),

    ]);
    const lowpriorityFees = (AllpriorityFees.result);
    const mediumpriorityFees = (AllpriorityFees.result2);
    const highpriorityFees = (AllpriorityFees.result3);
    const maxpriorityFees = (AllpriorityFees.result4);
    const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.data.value : 0;

    const {
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
    } = tokenMetadataResult;
    const marketCap =  birdeyeData?.response.data.data.mc? birdeyeData.response.data.data.mc : tokenInfo.marketCap.toNumber() * (solPrice).toFixed(2);
    try {

    const formattedmac = await formatNumberToKOrM(marketCap) ?? "NA";

    const tokenPriceUSD = birdeyeData 
    && birdeyeData.response 
    && birdeyeData.response.data 
    && birdeyeData.response.data.data 
    && birdeyeData.response.data.data.price != null  // This checks for both null and undefined
      ? birdeyeData.response.data.data.price 
      : tokenInfo.price.times(solPrice).toNumber();
      const tokenPriceSOL = birdeyeData ? (tokenPriceUSD / solPrice) : tokenInfo.price.toNumber();
  
    const priceImpact = tokenInfo.priceImpact.toFixed(2);
    const priceImpact_1 = tokenInfo.priceImpact_1.toFixed(2);
    const balanceInUSD = (balanceInSOL * (solPrice)).toFixed(2);
    const specificPosition = userPosition[0].positions.find((pos: any) => new PublicKey(pos.baseMint).equals(tokenAddress));
    let initialInUSD = 0;
    let initialInSOL = 0;
    let valueInUSD: any ;
    let valueInSOL: any ;
    let profitPercentage ;
    let profitInUSD ;
    let profitInSol ;

   
    if(specificPosition && specificPosition.amountOut ){

        valueInUSD = (specificPosition.amountOut - (userTokenDetails.userTokenBalance *  Math.pow(10,baseDecimals) )) < 5 ? userTokenDetails.userTokenBalance * Number(tokenPriceUSD) : 'N/A';
    
        valueInSOL = (specificPosition.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10,baseDecimals))) < 5 ? Number(((userTokenDetails.userTokenBalance)) * Number(tokenPriceSOL)) : 'N/A';
        initialInSOL = Number(specificPosition.amountIn) / 1e9;
        initialInUSD =  initialInSOL * Number(solPrice);
        profitPercentage = valueInSOL != 'N/A' ? (Number(valueInSOL) - (Number(specificPosition.amountIn) / 1e9 )) / (Number(specificPosition.amountIn) / 1e9) * 100 : 'N/A';
        profitInUSD = valueInUSD != 'N/A' ? Number(Number(userTokenDetails.userTokenBalance) * Number(tokenPriceUSD)) - initialInUSD : 'N/A';
        profitInSol = valueInSOL != 'N/A' ? (valueInSOL - initialInSOL).toFixed(4) : 'N/A';
     
    }
  
        // Construct the message
        let options: any;
        let messageText: any;


            messageText = `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
                `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
                `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
                `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
                `Market Cap: <b>${formattedmac} USD</b>\n` +
                `Token Price: <b> ${tokenPriceUSD.toFixed(4)} USD</b> | <b> ${tokenPriceSOL.toFixed(4)} SOL</b> \n\n` +
                // `💧 Liquidity: <b>${(formattedLiquidity)}</b>  USD\n` + 
                `Price Impact (5.0 SOL) : <b>${priceImpact}%</b>  |  (1.0 SOL): <b> ${priceImpact_1}%</b>\n\n` +
                `---<code>Trade Position</code>---\n` +
                `Initial : <b>${(initialInSOL).toFixed(3)} SOL</b> | <b>${(initialInUSD.toFixed(3))} USD</b>\n` +
                `Profit: ${profitInSol != 'N/A' ? Number(profitInSol).toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD != 'N/A' ? Number(profitInUSD).toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage != 'N/A' ? Number(profitPercentage).toFixed(2) : 'N/A'}%\n` +
                `Token Balance: <b>${userTokenDetails.userTokenBalance.toFixed(3)} $${userTokenDetails.userTokenSymbol} </b> | <b>${(Number(userTokenDetails.userTokenBalance) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${(Number(userTokenDetails.userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n\n` +
                `--<code>Priority fees</code>--\n Low: ${(Number(lowpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(mediumpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(highpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Max: ${(Number(maxpriorityFees) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
                `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n `;

            // Define buy mode inline keyboard
            options = {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: ' 🔂 Refresh ', callback_data: 'Refresh_display_after_Snipe_Buy' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                        [{ text: 'Buy (X SOL)', callback_data: 'buy_X_SOL' }, { text: 'Buy (0.5 SOL)', callback_data: 'buy_0.5_SOL' }, { text: 'Buy (1 SOL)', callback_data: 'buy_1_SOL' }],
                        [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }],
                        [{ text: '  Sell 25%  ', callback_data: 'sell_25_TOKEN' }, { text: '  Sell 50%  ', callback_data: 'sell_50_TOKEN' }, { text: 'Sell 75%', callback_data: '  sell_75_TOKEN  ' },],
                        [{ text: '  Sell 100%  ', callback_data: 'sell_100_TOKEN' }, { text: '  Sell X Amount  ', callback_data: 'sell_X_TOKEN' }],
                        [{ text: '📈 Priority fees', callback_data: '_' }],
                        [
                            { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Med ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },
                            { text: `High ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_high' }, { text: `Max ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_max' }
                        ],
                        [{ text: 'Close', callback_data: 'closing' }]]
                },
            };
 
        // Send or edit the message
        if(isRefresh){
            await ctx.editMessageText(messageText, options);
        }else{
            await ctx.api.sendMessage(chatId, messageText, options);

        }
    } catch (error: any) {
        console.error('Error in getTokenMetadata:', error.message);
        ctx.api.sendMessage(chatId, "Error getting token data, verify the address..", { parse_mode: 'HTML' });
    }
}

