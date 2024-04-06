import { PublicKey} from '@metaplex-foundation/js';
import { getLiquityFromOwner, getTokenMetadata, getUserTokenBalanceAndDetails } from '../../service/feeds';
import { quoteToken } from '../util/dataCalculation';
import { getSolanaDetails } from '../../api';
import { formatNumberToKOrM } from '../../service/util';
import { Connection } from '@solana/web3.js';

export async function Refresh_rugCheck(ctx: any) {
    const chatId = ctx.chat.id;
    const session = ctx.session;
    const token = session.rugCheckToken;
    const rugPool = session.activeTradingPool;
    const baseVault = rugPool.baseVault;
    const quoteVault = rugPool.quoteVault;
    const baseDecimals = rugPool.baseDecimals;
    const quoteDecimals = rugPool.quoteDecimals;
    const baseMint = rugPool.baseMint;
    ctx.session.snipeToken = baseMint;
    ctx.session.buyToken = baseMint;
    const lpMint = rugPool.lpMint;
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);

    try{
        const [tokenMetadataResult, solPrice, tokenInfo] = await Promise.all([
            getTokenMetadata(ctx, token.toBase58()),
            getSolanaDetails(),
            quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint, connection })
        ]);
    
        const {
            birdeyeURL,
            dextoolsURL,
            dexscreenerURL,
            tokenData,
        } = tokenMetadataResult;

    const tokenPriceSOL = tokenInfo.price.toNumber().toFixed(quoteDecimals);
    const tokenPriceUSD = (tokenInfo.price.times(solPrice)).toFixed(quoteDecimals);
    const marketCap = tokenInfo.marketCap.toNumber() * (solPrice).toFixed(2);
    
    const processData = (data: any) => {
        if (data.value?.data instanceof Buffer) {
            return null;
        }
        return data.value?.data.parsed.info;
    };

    const responses = await Promise.all([
        connection.getParsedAccountInfo(new PublicKey(quoteVault), "processed"),
        connection.getParsedAccountInfo(new PublicKey(baseMint), "processed"),
        connection.getParsedAccountInfo(new PublicKey(baseVault), "processed"),
        connection.getParsedAccountInfo(new PublicKey(lpMint), "processed"),
    ]);
    const getPooledSol= processData(responses[0]);
    const getBaseSupply= processData(responses[1]);
    const circulatingSupply = processData(responses[2]);
    const aMM = processData(responses[3]);
    const creatorAddress = tokenData.updateAuthorityAddress.toBase58();
    const circulatedSupply = Number(((Number(circulatingSupply.tokenAmount.amount)) / Math.pow(10, baseDecimals)).toFixed(2));
    const baseTokenSupply = Number(((Number(getBaseSupply.supply)) / Math.pow(10, baseDecimals)).toFixed(2));

    let [getCreatorPercentage, lpSupplyOwner, formattedCirculatingSupply, formattedSupply, formattedmac, formattedLiquidity] = await Promise.all([
        getLiquityFromOwner(new PublicKey(creatorAddress), new PublicKey(baseMint), connection),
        getLiquityFromOwner(new PublicKey(creatorAddress), new PublicKey(lpMint), connection),
        formatNumberToKOrM(Number(circulatedSupply)),
        formatNumberToKOrM(Number(baseTokenSupply)),
        formatNumberToKOrM(marketCap),
        formatNumberToKOrM((tokenInfo.liquidity * solPrice) / 0.5 )


    ]);

    const MutableInfo = tokenData.isMutable? '⚠️ Mutable' : '✅ Immutable';
    const renounced = tokenData.mint.mintAuthorityAddress?.toString() !== tokenData.updateAuthorityAddress.toString()? "✅" : "❌ No";
    // const lpSupplyOwner = await getLiquityFromOwner(new PublicKey(creatorAddress), new PublicKey(lpMint),connection);

    formattedmac = formattedmac ? formattedmac:  "NA";
    formattedLiquidity = formattedLiquidity ? formattedLiquidity : "N/A";

 
    const circulatingPercentage = (Number(circulatedSupply) / Number(baseTokenSupply) * 100).toFixed(2);
    const pooledSol = Number(((Number(getPooledSol.tokenAmount.amount)) / Math.pow(10, quoteDecimals)).toFixed(2));
    const isRaydium = aMM.mintAuthority === '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'? "<b>Raydium</b>" : "Unknown";
    const lpSupply = lpSupplyOwner.userTokenBalance; 
    const islpBurnt = lpSupply > 0 ? "❌ No" : "✅ Yes";
    const creatorPercentage = (Number(getCreatorPercentage.userTokenBalance) / Number(baseTokenSupply) * 100).toFixed(2);

    let messageText = `<b>------ ${tokenData.name} (${tokenData.symbol}) ------</b>\n` +
    `Contract: <code>${token}</code>\n\n` +
    `<b>Links:</b>\n` +
    `👁️ <a href="${birdeyeURL}">Birdeye View</a> | ` +
    `🛠 <a href="${dextoolsURL}">Dextools Analysis</a> | ` +
    `🔍 <a href="${dexscreenerURL}">Dexscreener</a>\n\n` +
    `<b>------ Details ------</b>\n` +
    `Creator: <code>${creatorAddress}</code>\n` +
    `Mutable Info: ${MutableInfo}\n`+ 
    `Renounced: ${renounced}\n\n` +
    `<code>------Financials------</code>\n` +
    `Total Supply: <b>${formattedSupply}</b> ${tokenData.symbol}\n` +
    `Circulating Supply: <b>${formattedCirculatingSupply}</b> ${tokenData.symbol} | <b>${circulatingPercentage}%</b>\n` +
    `Creator's percentage: <b>${creatorPercentage}%</b>\n` +
    `Price: <b>${tokenPriceUSD} USD</b> | <b>${tokenPriceSOL} SOL</b>\n` +
    `Market Cap: <b>${formattedmac}</b> USD\n` +
    `Liquidity: <b>${formattedLiquidity}</b> USD\n` +
    `Pooled SOL: <b>${pooledSol}</b> SOL\n` +
    `LP Burnt: ${islpBurnt}\n` +
    `AMM: <b>${isRaydium}</b>\n` ;
    let options: any;
    options = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: [
                [{ text: ' 🔂 Refresh ', callback_data: 'refrech_rug_check' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
                [{ text: '🎯 Turbo Snipe', callback_data: 'snipe' }],
                [{ text: '💱 Buy', callback_data: 'buy' }, { text: 'Sell 📈', callback_data: 'sell' }],
                [{ text: 'Close', callback_data: 'closing' }]
            ]
        }
    };

    await ctx.editMessageText(messageText, options);
} catch (error: any) {
    console.error('Error in Refresh_rugCheck:', error.message);
    throw error;
}
}