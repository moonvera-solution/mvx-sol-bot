import { PublicKey} from '@metaplex-foundation/js';
import { getLiquityFromOwner, getTokenMetadata, getUserTokenBalanceAndDetails } from '../service/feeds';
import { quoteToken } from './util/dataCalculation';
import { getSolanaDetails } from '../api';
import { formatNumberToKOrM, getSolBalance } from '../service/util';
import { Connection } from '@solana/web3.js';

export async function display_rugCheck(ctx: any) {
    
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
    const solprice = await getSolanaDetails();
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);
    

    const tokenInfo = await quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint,connection });
    const tokenPriceSOL = tokenInfo.price.toNumber().toFixed(quoteDecimals);
    const tokenPriceUSD = (tokenInfo.price.times(solprice)).toFixed(quoteDecimals);
    const marketCap = tokenInfo.marketCap.toNumber() * (solprice).toFixed(2);
    const formattedmac= await formatNumberToKOrM(marketCap) ?? "NA";
   // pool ration is 0.5 so we multiply by 2 or divide by 0.5
    const formattedLiquidity = await formatNumberToKOrM((tokenInfo.liquidity * solprice) / 0.5 ) ?? "N/A";
    const {
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
        tokenData,
    } = await getTokenMetadata(ctx, token.toBase58());

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
    console.log('circulatingSupply:', circulatingSupply);
    console.log('getBaseSupply:', getBaseSupply);
    console.log('getPooledSol:', getPooledSol);
    console.log('creatorAddress:', creatorAddress);
    const [getCreatorPercentage, lpSupplyOwner] = await Promise.all([
        getLiquityFromOwner(new PublicKey(creatorAddress), new PublicKey(baseMint), connection),
        getLiquityFromOwner(new PublicKey(creatorAddress), new PublicKey(lpMint), connection)
    ]);
    console.log('getCreatorPercentage:', getCreatorPercentage);
    console.log('lpSupplyOwner:', lpSupplyOwner);
    const MutableInfo = tokenData.isMutable? '⚠️ Mutable' : '✅ Immutable';
    const renounced = tokenData.mint.mintAuthorityAddress?.toString() !== tokenData.updateAuthorityAddress.toString()? "✅" : "❌ No";
    // const lpSupplyOwner = await getLiquityFromOwner(new PublicKey(creatorAddress), new PublicKey(lpMint),connection);

    const circulatedSupply = ((Number(circulatingSupply.amount)) / Math.pow(10, baseDecimals)).toFixed(2);
    const baseTokenSupply = ((Number(getBaseSupply.supply)) / Math.pow(10, baseDecimals)).toFixed(2);
    console.log('circulatedSupply:', circulatedSupply);
    console.log('baseTokenSupply:', baseTokenSupply);
    const [formattedCirculatingSupply, formattedSupply] = await Promise.all([
        formatNumberToKOrM(Number(circulatedSupply)),
        formatNumberToKOrM(Number(baseTokenSupply))
    ]);

    console.log('formattedCirculatingSupply:', formattedCirculatingSupply);
    console.log('formattedSupply:', formattedSupply);
    
    // const formattedCirculatingSupply = await formatNumberToKOrM(Number(circulatedSupply));
    const circulatingPercentage = (Number(circulatedSupply) / Number(baseTokenSupply) * 100).toFixed(2);
    const pooledSol = ((Number(getPooledSol.value?.data.parsed.info.tokenAmount.amount)) / Math.pow(10, quoteDecimals)).toFixed(2);
    // const formattedSupply = await formatNumberToKOrM(Number(baseTokenSupply));
    const isRaydium = aMM.mintAuthority === '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'? "<b>Raydium</b>" : "Unknown";
    const lpSupply = lpSupplyOwner.userTokenBalance; 
    const islpBurnt = lpSupply > 0 ? "❌ No" : "✅ Yes";
    // const getCreatorPercentage = await getLiquityFromOwner(new PublicKey(creatorAddress), new PublicKey(baseMint),connection);
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
    await ctx.api.sendMessage(chatId, messageText, options);

}