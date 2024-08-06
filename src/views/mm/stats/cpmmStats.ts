
import { getpoolDataCpmm, getRayCpmmPoolKeys, raydium_cpmm_swap } from "../../../service/dex/raydium/cpmm/index";
import { PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getuserShitBalance, getUserTokenBalanceAndDetails } from '../../../service/feeds';
import dotenv from "dotenv"; dotenv.config();
import { formatNumberToKOrM, getSolBalance, getSwapAmountOutCpmm, getSwapAmountOutPump, updatePositions } from '../../../service/util';
import { Keypair, Connection } from '@solana/web3.js';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { getTokenDataFromBirdEyePositions } from '../../../api/priceFeeds/birdEye';
import { UserPositions } from '../../../db/mongo/schema';
import { MVXBOT_FEES, SOL_ADDRESS } from '../../../config';
import bs58 from "bs58";
import BigNumber from 'bignumber.js';
import { saveUserPosition } from '../../../service/portfolio/positions';

export async function display_cpmm_stats(ctx: any, keys:any): Promise<string> {
    const connection = new Connection(`${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`);
    const cpmmPoolKey = keys.id;
    console.log('cpmmPoolKey', cpmmPoolKey);

    if (!cpmmPoolKey) throw new Error('cpmmPoolKey is not set');

    // console.log('ctx.session.cpmmPoolInfo', ctx.session.cpmmPoolInfo);
    const chatId = ctx.chat.id;
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
    const payerKeypair = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[activeWalletIndexIdx].secretKey));
    // console.log("cpmmPoolKey-%c>", cpmmPoolKey);
    ctx.session.cpmmPoolInfo = await getpoolDataCpmm(payerKeypair, cpmmPoolKey, connection);

    const tokenAddress = new PublicKey(ctx.session.cpmmPoolInfo.mintB.address);
    const [
        shitBalance,
        birdeyeData,
        tokenMetadataResult,
        balanceInSOL,
        userPosition,
        userTokenDetails,
        jupSolPrice

    ] = await Promise.all([
        getuserShitBalance(userPublicKey, tokenAddress, connection),
        getTokenDataFromBirdEyePositions(tokenAddress.toString(), userPublicKey),
        getTokenMetadata(ctx, tokenAddress.toBase58()),
        getSolBalance(userPublicKey, connection),
        UserPositions.find({ positionChatId: chatId, walletId: userPublicKey }, { positions: { $slice: -7 } }),
        getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress, connection),
        fetch(
            `https://price.jup.ag/v6/price?ids=SOL`
        ).then((response) => response.json()),
    ]);

    const cpmmSupply = new BigNumber(tokenMetadataResult.tokenData.mint.supply.basisPoints)

    const priceCpmm = ctx.session.cpmmPoolInfo.mintAmountA / ctx.session.cpmmPoolInfo.mintAmountB;

    const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.value : Number(jupSolPrice.data.SOL.price);
    // console.log('cpmmPrice', priceCpmm * solPrice);

    const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;
    const tokenSupply = Number(cpmmSupply) / decimals
    const tokenPriceUSD = birdeyeData
        && birdeyeData.response
        && birdeyeData.response.data
        && birdeyeData.response.data.price != null  // This checks for both null and undefined
        ? birdeyeData.response.data.price
        : priceCpmm * solPrice;

    // console.log('tokenPriceUSD', tokenPriceUSD);
    const tokenPriceSOL = birdeyeData ? (tokenPriceUSD / solPrice) : Number(priceCpmm);

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
        valueInUSD = (specificPosition.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, decimals))) < 5 ? userTokenDetails.userTokenBalance * Number(tokenPriceUSD) : 'N/A';
        valueInSOL = (specificPosition.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, decimals))) < 5 ? Number(((userTokenDetails.userTokenBalance)) * Number(tokenPriceSOL)) : 'N/A';
        initialInSOL = Number(specificPosition.amountIn) / 1e9;
        initialInUSD = initialInSOL * Number(solPrice);
        profitPercentage = valueInSOL != 'N/A' ? (Number(valueInSOL) - (Number(specificPosition.amountIn) / 1e9)) / (Number(specificPosition.amountIn) / 1e9) * 100 : 'N/A';
        profitInUSD = valueInUSD != 'N/A' ? Number(Number(userTokenDetails.userTokenBalance) * Number(tokenPriceUSD)) - initialInUSD : 'N/A';
        profitInSol = valueInSOL != 'N/A' ? (valueInSOL - initialInSOL).toFixed(4) : 'N/A';
    }

    const {
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
        tokenData,
    } = tokenMetadataResult;
    const baseSupply = birdeyeData
        && birdeyeData.response
        && birdeyeData.response.data
        && birdeyeData.response.data.supply != null  // This checks for both null and undefined
        ? birdeyeData.response.data.supply
        : tokenSupply;
    const mcap = baseSupply * tokenPriceUSD;
    const netWorth = birdeyeData
        && birdeyeData.birdeyePosition
        && birdeyeData.birdeyePosition.data
        && birdeyeData.birdeyePosition.data.totalUsd
        ? birdeyeData.birdeyePosition.data.totalUsd : NaN;

    const netWorthSol = netWorth / solPrice;

    const formattedmac = await formatNumberToKOrM(mcap) ?? "NA";

    // const priceImpact = tokenInfo.priceImpact.toFixed(2);
    const balanceInUSD = (balanceInSOL * (solPrice)).toFixed(2);
    // Construct the message
    let options: any;
    let messageText: any;


    messageText = `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
        `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
        `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
        `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
        `Market Cap: <b>${formattedmac} USD</b>\n` +
        `Token Price: <b> ${tokenPriceUSD.toFixed(9)} USD</b> | <b> ${tokenPriceSOL.toFixed(9)} SOL</b> \n\n`;


    return messageText;
}   