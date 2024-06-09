
import { UserPositions } from '../../db';
import BigNumber from 'bignumber.js';
type Commitment = 'processed' | 'confirmed' | 'finalized' | 'recent' | 'single' | 'singleGossip' | 'root' | 'max';

export interface Position {
  baseMint: string;
  name: string;
  symbol: string;
  tradeType: string;
  amountIn: number;
  amountOut: number | undefined;
}

export interface UserPosition {
  pos: Position;
  userBalance: BigNumber;
}
// NEVER PASS CTX TO BACKEND FUNCTIONS
export async function saveUserPosition(chatId:string, walletId:string, newPosition:Position) {

    try {
        const userPosition = await UserPositions.findOne({positionChatId: chatId, walletId:walletId });
        if (userPosition) {
            const existingPositionIndex = userPosition.positions.findIndex(
                position => position.baseMint === newPosition.baseMint.toString()
            );
            if (existingPositionIndex === -1) {
                userPosition.positions.push(newPosition);
                userPosition.save().then(() =>{
                    console.log("Saved new position:",newPosition);
                });
              } else {
                userPosition.positions[existingPositionIndex] = newPosition;
                userPosition.save().then(() =>{
                    console.log("Updated existing position on db: ",newPosition);
                });
            }
        } else {
            const savePosition = new UserPositions({
                positionChatId: chatId,
                walletId: walletId ,
                positions: newPosition,
               });
               savePosition.save().then(() =>{
                console.log('Saved new user & position', newPosition)
            });
        }
    } catch (err) {
        console.error(err);
    }
}


// async function getPositionsFromRaydium(wallet: string) {
//     const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
//     const portfolios: any = [];

//     const filters: GetProgramAccountsFilter[] = [{ dataSize: 80 }, { memcmp: { offset: 32, bytes: wallet, }, }];
//     const accounts = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, { filters: filters });
//     console.log(`Found ${accounts.length} token account(s) for wallet ${wallet}.`);
//  try{
//     for (const [i, account] of accounts.entries()) {
//         const parsedAccountInfo: any = account.account.data;
//         const mintAddress: string = parsedAccountInfo["parsed"]["info"]["mint"];
//         const tokenBalance: number = parsedAccountInfo["parsed"]["info"]["tokenAmount"]["amount"];
//         console.log("adding", i);

//         const keys = await getRayPoolKeys(mintAddress);
//         console.log("adding", i, keys);
//         console.log("time", (new Date()).toLocaleString());
//         // await new Promise(resolve => setTimeout(resolve, 1000));
//         console.log("time", (new Date()).toLocaleString());

//         if (keys.authority == "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1") {
//             const { quoteTokenVaultSupply } = await _getReservers(new PublicKey(keys.baseVault), new PublicKey(keys.quoteVault));
//             if (quoteTokenVaultSupply.toNumber() > tokenBalance) {
//                 portfolios.push({ baseMint: mintAddress, balance: tokenBalance });
//             }
//         }
//     }
//     return portfolios.sort((a: any, b: any) => b.balance - a.balance).slice(0, 10);
//  } catch (err) {
//     console.error(err);
//  }
    
// }

// export async function getTokensFromWallet(ctx: any) {
//     const chatId = ctx.chat.id;
//     const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex]?.publicKey;

//     const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
//     const portfolios: any = [];
//     const filters: GetProgramAccountsFilter[] = [{ dataSize: 165 }, { memcmp: { offset: 32, bytes: userWallet }, }];
//     const accounts = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, { filters: filters });
//     console.log(`Found ${accounts.length} token account(s) for wallet ${userWallet}.`);
// try{
//     for (const [i, account] of accounts.entries()) {
//         const parsedAccountInfo: any = account.account.data;
//         const mintAddress: string = parsedAccountInfo["parsed"]["info"]["mint"];
//         const tokenBalance: number = parsedAccountInfo["parsed"]["info"]["tokenAmount"]["amount"];
//         console.log("Token Balance", tokenBalance);
//         if (tokenBalance > 0) {
//             const rayPoolKeys = await getRayPoolKeys(mintAddress);
//             if (!rayPoolKeys) {
//                 continue;
//             }
//             const baseVault = rayPoolKeys.baseVault!;
//             const quoteVault = rayPoolKeys.quoteVault;
//             const baseDecimals = rayPoolKeys.baseDecimals;
//             const quoteDecimals = rayPoolKeys.quoteDecimals;
//             const baseMint = rayPoolKeys.baseMint;
//             // const tokenAddress = new PublicKey(baseMint);
//             const tokenInfo = await quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint });
//             const tokenPriceSOL = tokenInfo.price.toNumber().toFixed(quoteDecimals);
//             const marketCap = tokenInfo.marketCap.toNumber() ;
//             console.log("Token Price SOL", tokenPriceSOL);
//             console.log("Market Cap", marketCap);
//             const tokenValue = (tokenBalance / Math.pow(10, baseDecimals)) * Number(tokenPriceSOL);
//             console.log("Token Value", tokenValue);
//             if (tokenValue >= 0.001 && marketCap >= 1) {
//                 portfolios.push({ mintAddress, tokenBalance, tokenValue });
//             }
//         }    
//     }
//         const sorting = portfolios.sort((a: any, b: any) => b.tokenValue - a.tokenValue).slice(0, 30);
//         console.log("Filtered Tokens", sorting);
//         ctx.session.positionPool = sorting;
//         console.log("Session Position Pool", ctx.session.positionPool.length);
//         return sorting;
// } catch (err) {
//     console.error(err);

// }
   
    
// }

// getTokensFromWallet();

/// checl wallet tokens 
/// filter them 
// uyse them ij positions 
// check amount in with db based on balance 
// porofit na