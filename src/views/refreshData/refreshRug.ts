import { PublicKey} from '@metaplex-foundation/js';
import { getLiquityFromOwner, getTokenMetadata, getUserTokenBalanceAndDetails } from '../../service/feeds';
import TelegramBot from 'node-telegram-bot-api';
import { quoteToken } from '../util/dataCalculation';
import { getSolanaDetails } from '../../api';
import { formatNumberToKOrM, getSolBalance } from '../../service/util';
import axios from 'axios';
import { Connection } from '@solana/web3.js';
import { LIQUIDITY_STATE_LAYOUT_V4, publicKey } from '@raydium-io/raydium-sdk';
const connection_only = new Connection('https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41'); // TRITON

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
    const lpMint = rugPool.lpMint;
    console.log('lpMint', lpMint);  
    const solprice = await getSolanaDetails();
    const tokenInfo = await quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint });
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
    const MutableInfo = tokenData.isMutable? '⚠️ Mutable' : '✅ Immutable';
    const creatorAddress = tokenData.updateAuthorityAddress.toBase58();
    const renounced = tokenData.mint.mintAuthorityAddress?.toString() !== tokenData.updateAuthorityAddress.toString()? "✅" : "❌ No";
    const lpSupplyOwner = await getLiquityFromOwner(new PublicKey(creatorAddress), new PublicKey(lpMint));
    const getPooledSol: any = await connection_only.getParsedAccountInfo(new PublicKey(quoteVault), "processed");
    const getBaseSupply: any = await connection_only.getParsedAccountInfo(new PublicKey(baseMint), "processed");
    const circulatingSupply: any = await connection_only.getParsedAccountInfo(new PublicKey(baseVault));
    const circulatedSupply = ((Number(circulatingSupply.value?.data.parsed.info.tokenAmount.amount)) / Math.pow(10, baseDecimals)).toFixed(2);
    const baseTokenSupply = ((Number(getBaseSupply.value?.data.parsed.info.supply)) / Math.pow(10, baseDecimals)).toFixed(2);
    const formattedCirculatingSupply = await formatNumberToKOrM(Number(circulatedSupply));
    const circulatingPercentage = (Number(circulatedSupply) / Number(baseTokenSupply) * 100).toFixed(2);
    const pooledSol = ((Number(getPooledSol.value?.data.parsed.info.tokenAmount.amount)) / Math.pow(10, quoteDecimals)).toFixed(2);
    const aMM: any = await connection_only.getParsedAccountInfo(new PublicKey(lpMint), "processed");
    const exchanger = aMM.value?.data.parsed.info.mintAuthority;
    const formattedSupply = await formatNumberToKOrM(Number(baseTokenSupply));
    const isRaydium = exchanger.toString() === '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'? "<b>Raydium</b>" : "Unknown";
    const lpSupply = lpSupplyOwner.userTokenBalance; 
    const islpBurnt = lpSupply > 0 ? "❌ No" : "✅ Yes";
    const getCreatorPercentage = await getLiquityFromOwner(new PublicKey(creatorAddress), new PublicKey(baseMint));
    const creatorPercentage = (Number(getCreatorPercentage.userTokenBalance) / Number(baseTokenSupply) * 100).toFixed(2);
    try {
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