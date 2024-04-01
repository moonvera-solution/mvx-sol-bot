import { isValidBase58, formatNumberToKOrM, getSolBalance } from "../util";
import { Liquidity, LiquidityPoolKeys, Percent, jsonInfo2PoolKeys, TOKEN_PROGRAM_ID, Token as RayddiumToken, publicKey } from '@raydium-io/raydium-sdk';
import { PublicKey,Connection } from '@solana/web3.js';
import {RAYDIUM_POOL_TYPE} from '../util/types';
import {
   
    getSolanaDetails
} from '../../api';
import { Metaplex } from "@metaplex-foundation/js";

export async function getTokenMetadata(ctx: any, tokenAddress: string): Promise<any> {
    // console.log('tokenAddress',tokenAddress)
    // console.log('ctx.session',ctx.session)
    // const tokenAddress = ctx.session.portfolio.activeTradingPool.baseMint;
    const chatId = ctx.chat.id;
    if (!isValidBase58(tokenAddress)) {
        console.error('Invalid token address:', tokenAddress);
        ctx.api.sendMessage(chatId, "Invalid token address provided.", { parse_mode: 'HTML' });
        return;
    }
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);
    const metaplex = Metaplex.make(connection);
    const mintAddress = new PublicKey(tokenAddress);
    const tokenData = await metaplex.nfts().findByMint({ mintAddress: mintAddress });

    const activeWalletIndexIdx: number = ctx.session.activeWalletIndex;
    const publicKeyString = ctx.session.portfolio.wallets[activeWalletIndexIdx]!.publicKey;
    // const solanaDetails = await getSolanaDetails();
   
    // const liquidityInfo = await getLiquidityFromDextools(tokenAddress);
    // const marketCap = await getMarketCapFromDextools('solana', tokenAddress);
    // const holdersToken = await getHoldersFromDextools('solana', tokenAddress);
    // const priceChanges = await getPriceChangesFromDextools(tokenAddress);
    // Call the refactored function with the results of the API calls

    // const decimals = token.mint.decimals;
    const userTokenDetails = await getUserTokenBalanceAndDetails(new PublicKey(publicKeyString), new PublicKey(tokenAddress),connection);
    const birdeyeURL = `https://birdeye.so/token/${tokenAddress}?chain=solana`;
    const dextoolsURL = `https://www.dextools.io/app/solana/pair-explorer/${tokenAddress}`;
    const dexscreenerURL = `https://dexscreener.com/solana/${tokenAddress}`;
    // const formattedLiquidity = await formatNumberToKOrM(Number(tokenInfo.liquidity)) ?? "N/A";
    // const formattedmac = await formatNumberToKOrM(tokenInfo.mc) ?? "NA";
    // formattedpooledSol =  liquidityInfo.sideTokenReserve

    // Process the data received from the API calls
    // const solPriceInUSD = solanaDetails.toFixed(3);
    const balanceInSOL = await getSolBalance(publicKeyString,connection);
    // const balanceInUSD = (balanceInSOL * (solanaDetails).toFixed(2));
    return {
        // solanaDetails,
        tokenData,
        // tokenInfo,
        // tokenCreator,
        // tokenCreatorPercentage,
        userTokenDetails,
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
        // formattedLiquidity,
        // formattedmac,
        // solPriceInUSD,
        balanceInSOL,
        // balanceInUSD,
    }
}

// Instanceoff is to avoid getting mint.buffer error
export async function getUserTokenBalanceAndDetails(userWallet: PublicKey, tokenAddress: PublicKey,connection:Connection) : Promise<any> {
    let userBalance = 0;
    try {

        const metaplex = Metaplex.make(connection);
        const mintAddress = (tokenAddress instanceof PublicKey) ? tokenAddress : new PublicKey(tokenAddress);
        const tokenD = await metaplex.nfts().findByMint({ mintAddress });
        const walletPublicKey = (userWallet instanceof PublicKey) ? userWallet : new PublicKey(userWallet);
        let tokenAccountInfo = await connection.getParsedTokenAccountsByOwner(walletPublicKey, {
            mint: mintAddress,
            programId: TOKEN_PROGRAM_ID
        });
        userBalance = tokenAccountInfo.value[0] && tokenAccountInfo.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        let userBalanceTest:number = userBalance ? userBalance : 0;
        return {
            userTokenBalance: userBalanceTest,
            decimals: tokenD.mint.currency.decimals,
            userTokenSymbol: tokenD.mint.currency.symbol,
            userTokenName: tokenD.name
        }
    
    } catch (error) {
        console.error("Error in getUserTokenBalanceAndDetails: ", error);
        throw error;
    }
}

export async function getLiquityFromOwner(userWallet: PublicKey, tokenAddress: PublicKey,connection:Connection) : Promise<any> {
    let userBalance = 0;
    try {
        const mintAddress = (tokenAddress instanceof PublicKey) ? tokenAddress : new PublicKey(tokenAddress);
        const walletPublicKey = (userWallet instanceof PublicKey) ? userWallet : new PublicKey(userWallet);
        let tokenAccountInfo = await connection.getParsedTokenAccountsByOwner(walletPublicKey, {
            mint: mintAddress,
            programId: TOKEN_PROGRAM_ID
        });
        userBalance = tokenAccountInfo.value[0] && tokenAccountInfo.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        let userBalanceTest:number = userBalance ? userBalance : 0;
        return {
            userTokenBalance: userBalanceTest,
          
        }
    
    } catch (error) {
        console.error("Error in getUserTokenBalanceAndDetails: ", error);
        throw error;
    }
}
