import { PublicKey ,Connection} from '@solana/web3.js';
import {getTokenMetadata, getUserTokenBalanceAndDetails} from '../../service/feeds'
import { DEFAULT_PUBLIC_KEY, RAYDIUM_POOL_TYPE } from '../../service/util/types';
import { getSolanaDetails } from '../../api/priceFeeds/coinMarket';
import { quoteToken } from '../util/dataCalculation';
import { formatNumberToKOrM, getSolBalance } from '../../service/util';
import { runMin, runMedium, runHigh, runMax } from '../util/getPriority';

export async function refreshSnipeDetails(ctx: any) {
    try{
    let options: any;
    let messageText: any;

    const priority_Level = ctx.session.priorityFees;
    const activePool = ctx.session.activeTradingPool;
    const rayPoolKeys = ctx.session.activeTradingPool as RAYDIUM_POOL_TYPE;
    ctx.session.currentMode = 'snipe';
    let raydiumId = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'

    const activeWalletIndexIdx: number = ctx.session.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
    if (activePool && activePool.baseMint != DEFAULT_PUBLIC_KEY) {

    // showing the user the countdowm to the snipe
    const currentTime = new Date();
    let poolStartTime = new Date();
    if(!ctx.session.poolTime.startTime) {
     poolStartTime = new Date(ctx.session.poolTime.startTime!.toNumber() * 1000); }

    let poolStatusMessage;
    if (currentTime >= poolStartTime) {
        poolStatusMessage = "✅ Opened";
    } else {
        const timeDiff = Number(poolStartTime) - Number(currentTime);
        const countdown = new Date(timeDiff).toISOString().substr(11, 8); 
        poolStatusMessage = `⏳ Opening in ${countdown}`;
    }

    // const { baseVault, quoteVault, baseDecimals, quoteDecimals, baseMint } = ctx.session.buyTokenData;
    const baseVault = rayPoolKeys.baseVault;
    const quoteVault = rayPoolKeys.quoteVault;
    const baseDecimals = rayPoolKeys.baseDecimals;
    const quoteDecimals = rayPoolKeys.quoteDecimals;
    const baseMint = rayPoolKeys.baseMint;
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);
    const tokenAddress = new PublicKey(ctx.session.snipeToken);
    const [tokenMetadataResult, solPrice, tokenInfo, balanceInSOL,userTokenDetails] = await Promise.all([
        getTokenMetadata(ctx, tokenAddress.toBase58()),
        getSolanaDetails(),
        quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint, connection }),
        getSolBalance(userPublicKey,connection),
        getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress, connection)

    ]);
    const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;

    const {
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
        tokenData,
    } = tokenMetadataResult;
    async function getPriorityFees(ctx: any, raydiumId: string) {
        return await Promise.all([
            runMin(ctx, raydiumId),
            runMedium(ctx, raydiumId),
            runHigh(ctx, raydiumId),
            runMax(ctx, raydiumId)
        ]);
    }
    const [lowPriorityFee, mediumPriorityFee, highPriorityFee, maxPriorityFee] = await getPriorityFees(ctx, raydiumId);
 
    const tokenPriceSOL = tokenInfo.price.toNumber().toFixed(quoteDecimals);
    const tokenPriceUSD = (Number(tokenInfo.price.toNumber()) * (solPrice)).toFixed(quoteDecimals);const marketCap = tokenInfo.marketCap.toNumber() * (solPrice).toFixed(2);
    const priceImpact = tokenInfo.priceImpact.toFixed(2);
    const priceImpact_1 = tokenInfo.priceImpact_1.toFixed(2);
    const formattedmac= await formatNumberToKOrM(marketCap) ?? "NA";
  
    // const balanceInSOL = await getSolBalance(userPublicKey,connection);
    const balanceInUSD = (balanceInSOL * (solPrice)).toFixed(2);
    // const { userTokenBalance, decimals, userTokenSymbol } = await getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress,connection);

     messageText = `<b>${tokenMetadataResult.tokenData.name} (${tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
                `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
                `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
                `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
                `Market Cap: <b>${formattedmac} USD</b>\n` +
                `Token Price: <b> ${tokenPriceUSD} USD</b> | <b> ${tokenPriceSOL} SOL</b> \n\n` +
                // `💧 Liquidity: <b>${(formattedLiquidity)}</b>  USD\n` + 
                `price Impact (5.0 SOL) : <b>${priceImpact}%</b> | (1.0 SOL): <b>${priceImpact_1}%</b> \n\n` +
                `Pool Status: <b>${poolStatusMessage}</b>\n\n` +
                `--<code>Priority fees</code>--\n Low: ${(Number(lowPriorityFee) /1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(mediumPriorityFee) /1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(highPriorityFee) /1e9).toFixed(7)} <b>SOL</b>\n Max: ${(Number(maxPriorityFee) /1e9).toFixed(7)} <b>SOL</b> \n\n` +
                `Token Balance: <b>${userTokenDetails.userTokenBalance.toFixed(3)} $${userTokenDetails.userTokenSymbol} </b> | <b>${((userTokenBalance?.toFixed(3)) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((userTokenBalance?.toFixed(3)) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
                `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n ` ;
} else {
    const { tokenData } = await getTokenMetadata(ctx, ctx.session.snipeToken);
    messageText = `<b>${tokenData.name} (${tokenData.symbol})</b> | 📄 CA: <code>${ctx.session.snipeToken}</code> <a href="copy:${ctx.session.snipeToken}">🅲</a>\n` +
    `No pool available for this token yet. \nSet Sniper by selecting slippage and amount.`;
}          
                options = {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: ' 🔂 Refresh ', callback_data: 'refresh_snipe' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                            // [{ text: ' 🎯  Turbo Snipping ', callback_data: '_' }],
                            [{ text: '🎯 X SOL', callback_data: 'snipe_X_SOL' }, { text: '🎯 1 SOL', callback_data: 'snipe_1_SOL' }, { text: '🎯 5 SOL', callback_data: 'snipe_5_SOL' }],
                            [{ text: `⛷️ Set Slippage (${ctx.session.snipeSlippage}%) 🖋️`, callback_data: 'set_snipe_slippage' },{ text: 'Selling Mode 💸', callback_data: 'sell' }],
                            [{ text: '📈 Priority fees', callback_data: '_' }],
                            [ 
                                { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Medium ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },
                                { text: `High ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_high' }, { text: `Max ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_max' }
                            ],
                            [{ text: 'Cancel', callback_data: 'closing' }]
                        ]
                    },
                };

                await ctx.editMessageText(messageText, options);
            }catch(err){
                console.error(err);
                console.log("Error fetching wallet balance.");
            }
            
        }