import { PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getUserTokenBalanceAndDetails } from '../../service/feeds';
import { quoteToken } from '../util/dataCalculation';
import { getSolanaDetails } from '../../api';
import { formatNumberToKOrM, getSolBalance } from '../../service/util';
import { RAYDIUM_POOL_TYPE } from '../../service/util/types';
import { Keypair, Connection } from '@solana/web3.js';
import { runHigh, runMax, runMedium, runMin } from '../util/getPriority';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { logErrorToFile } from "../../../error/logger";
import { UserPositions } from '../../db';
import { getTokenDataFromBirdEye } from '../../api/priceFeeds/birdEye';



export async function display_limitOrder_token_details(ctx: any, isRefresh: boolean) {

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
    const tokenAddress = new PublicKey(baseMint);
    const chatId = ctx.chat.id;
    const activeWalletIndexIdx: number = ctx.session.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
    const [
        birdeyeData,
        tokenMetadataResult,
        solPrice,
        tokenInfo,
        balanceInSOL,
        userPosition,
        userTokenDetails,
        lowpriorityFees,
        mediumpriorityFees,
        highpriorityFees,
        maxpriorityFees
    ] = await Promise.all([
        getTokenDataFromBirdEye(tokenAddress.toString()),
        getTokenMetadata(ctx, tokenAddress.toBase58()),
        getSolanaDetails(),
        quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint, connection }),
        getSolBalance(userPublicKey, connection),
        UserPositions.find({ positionChatId: chatId, walletId: userPublicKey }, { positions: { $slice: -7 } }),
        getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress, connection),
        runMin(ctx, raydiumId),
        runMedium(ctx, raydiumId),
        runHigh(ctx, raydiumId),
        runMax(ctx, raydiumId)
    ]);
    const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;
    const tokenPriceUSD = birdeyeData && birdeyeData.response && birdeyeData.response.data
        && birdeyeData.response.data.data && birdeyeData.response.data.data.price != null ? birdeyeData.response.data.data.price : tokenInfo.price.times(solPrice).toNumber();
    const tokenPriceSOL = birdeyeData ? (tokenPriceUSD / solPrice) : tokenInfo.price.toNumber();
    let specificPosition;
    if (userPosition[0] && userPosition[0].positions && userPosition[0].positions != undefined) {
        specificPosition = userPosition[0].positions.find((pos: any) => new PublicKey(pos.baseMint).equals(tokenAddress));
    }
    let initialInUSD = 0;
    let initialInSOL = 0;
    let valueInUSD: any;
    let valueInSOL: any;
    let profitPercentage;
    let profitInUSD;
    let profitInSol;
    if (specificPosition && specificPosition.amountOut) {
        valueInUSD = (specificPosition.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, baseDecimals))) < 5 ? userTokenDetails.userTokenBalance * Number(tokenPriceUSD) : 'N/A';
        valueInSOL = (specificPosition.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, baseDecimals))) < 5 ? Number(((userTokenDetails.userTokenBalance)) * Number(tokenPriceSOL)) : 'N/A';
        initialInSOL = Number(specificPosition.amountIn) / 1e9;
        initialInUSD = initialInSOL * Number(solPrice);
        profitPercentage = valueInSOL != 'N/A' ? (Number(valueInSOL) - (Number(specificPosition.amountIn) / 1e9)) / (Number(specificPosition.amountIn) / 1e9) * 100 : 'N/A';
        profitInUSD = valueInUSD != 'N/A' ? Number(Number(userTokenDetails.userTokenBalance) * Number(tokenPriceUSD)) - initialInUSD : 'N/A';
        profitInSol = valueInSOL != 'N/A' ? (valueInSOL - initialInSOL).toFixed(4) : 'N/A';
    }
    const { birdeyeURL, dextoolsURL, dexscreenerURL, tokenData } = tokenMetadataResult;
    const marketCap = birdeyeData?.response.data.data.mc ? birdeyeData.response.data.data.mc : tokenInfo.marketCap.toNumber() * (solPrice);
    try {

        const formattedmac = await formatNumberToKOrM(marketCap) ?? "NA";
        const priceImpact = tokenInfo.priceImpact.toFixed(2);
        const priceImpact_1 = tokenInfo.priceImpact_1.toFixed(2);
        const balanceInUSD = (balanceInSOL * (solPrice)).toFixed(2);
        // Construct the message
        let options: any;
        let messageText: any;

        if (ctx.session.latestCommand == 'limitOrders') {

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
                        [{ text: ' Set Limit Order ', callback_data: '_' }],
                        [{ text: ' 🔂 Refresh ', callback_data: 'refresh_trade' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                        [{ text: ` Side: buy/sell  (${ctx.session.limOrderSide})`, callback_data: 'set_limit_order_side' }],
                        [{ text: ` Order Amount  (${ctx.session.limOrderAmount})`, callback_data: 'set_limit_order_amount' }],
                        [{ text: ` Target Price (${ctx.session.limOrderPrice}) `, callback_data: 'set_limit_order_price' }],
                        [{ text: 'Close', callback_data: 'closing' }]
                    ],
                },
            };
        }

        // Send or edit the message
        if (isRefresh) {
            await ctx.editMessageText(messageText, options);
        } else {
            await ctx.api.sendMessage(chatId, messageText, options);

        }
    } catch (error: any) {
        console.error('Error in LimOrderTokenMetadata:', error.message);
        await ctx.api.sendMessage(chatId, "Error getting token data, verify the address..", { parse_mode: 'HTML' });
    }
}