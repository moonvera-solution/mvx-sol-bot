import { isValidBase58 } from "../util";
import { TOKEN_PROGRAM_ID, Token as RayddiumToken, publicKey } from '@raydium-io/raydium-sdk';
import { PublicKey,Connection } from '@solana/web3.js';

import { Metaplex } from "@metaplex-foundation/js";

export async function getTokenMetadata(ctx: any, tokenAddress: string): Promise<any> {
    const chatId = ctx.chat.id;
    if (!isValidBase58(tokenAddress)) {
        console.error('Invalid token address:', tokenAddress);
        ctx.api.sendMessage(chatId, "Invalid token address provided.", { parse_mode: 'HTML' });
        return;
    }
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
    const metaplex = Metaplex.make(connection);
    const mintAddress = new PublicKey(tokenAddress);
    const tokenData = await metaplex.nfts().findByMint({ mintAddress: mintAddress });
    const birdeyeURL = `https://birdeye.so/token/${tokenAddress}?chain=solana`;
    const dextoolsURL = `https://www.dextools.io/app/solana/pair-explorer/${tokenAddress}`;
    const dexscreenerURL = `https://dexscreener.com/solana/${tokenAddress}`;
    return {
        tokenData,
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,

    }
}

// Instanceoff is to avoid getting mint.buffer error
export async function getUserTokenBalanceAndDetails(userWallet: PublicKey, tokenAddress: PublicKey,connection:Connection) : Promise<any> {
    let userBalance = 0;
    try {
        const metaplex = Metaplex.make(connection);
        const walletPublicKey = (userWallet instanceof PublicKey) ? userWallet : new PublicKey(userWallet);

        const mintAddress = (tokenAddress instanceof PublicKey) ? tokenAddress : new PublicKey(tokenAddress);
        const [tokenD , tokenAccountInfo] = await Promise.all([
            metaplex.nfts().findByMint({ mintAddress }),
            connection.getParsedTokenAccountsByOwner(walletPublicKey, {
                    mint: mintAddress,
                    programId: TOKEN_PROGRAM_ID
                })
        ]) ;
   
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
    }
}
