import { connection } from "../../../config";
import { getRayPoolKeys } from "../dex/raydium/market-data/1_Geyser";
import { _getReservers } from '../../service/dex/raydium/market-data/2_Strategy';
import { RAYDIUM_POOL_TYPE } from '../util/types';
import { Keypair, PublicKey, SendOptions, Signer, GetProgramAccountsFilter } from '@solana/web3.js';
import { UserPositions } from '../../db';
type Commitment = 'processed' | 'confirmed' | 'finalized' | 'recent' | 'single' | 'singleGossip' | 'root' | 'max';



export async function saveUserPosition(walletId: String, newPosition:
    {
        baseMint: string;
        symbol: string;
        tradeType: string;
        amountIn: number;
        amountOut: number | undefined;
    }) {
    try {
        const userPosition = await UserPositions.findOne({ walletId: walletId });
        if (userPosition) {
            const existingPosition = userPosition.positions.find(
                position => position.baseMint === newPosition.baseMint
            );
            if (!existingPosition) {
                await UserPositions.findOneAndUpdate(
                    { walletId: walletId },
                    { $push: { positions: newPosition } },
                    { upsert: true, new: true }
                );
            }
        } else {
            await UserPositions.findOneAndUpdate(
                { walletId: walletId },
                { $push: { positions: newPosition } },
                { upsert: true, new: true }
            );
        }
    } catch (err) {
        console.error(err);
    }
}


async function getPositionsFromRaydium(wallet: string) {
    const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const portfolios: any = [];

    const filters: GetProgramAccountsFilter[] = [{ dataSize: 80 }, { memcmp: { offset: 32, bytes: wallet, }, }];
    const accounts = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, { filters: filters });
    console.log(`Found ${accounts.length} token account(s) for wallet ${wallet}.`);

    for (const [i, account] of accounts.entries()) {
        const parsedAccountInfo: any = account.account.data;
        const mintAddress: string = parsedAccountInfo["parsed"]["info"]["mint"];
        const tokenBalance: number = parsedAccountInfo["parsed"]["info"]["tokenAmount"]["amount"];
        console.log("adding", i);

        const keys = await getRayPoolKeys(mintAddress);
        console.log("adding", i, keys);
        console.log("time", (new Date()).toLocaleString());
        // await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("time", (new Date()).toLocaleString());

        if (keys.authority == "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1") {
            const { quoteTokenVaultSupply } = await _getReservers(new PublicKey(keys.baseVault), new PublicKey(keys.quoteVault));
            if (quoteTokenVaultSupply.toNumber() > tokenBalance) {
                portfolios.push({ baseMint: mintAddress, balance: tokenBalance });
            }
        }
    }
    return portfolios.sort((a: any, b: any) => b.balance - a.balance).slice(0, 10);
}

export async function getTokensFromWallet(wallet: string) {
    const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const portfolios: any = [];
    const filters: GetProgramAccountsFilter[] = [{ dataSize: 165 }, { memcmp: { offset: 32, bytes: wallet, }, }];
    const accounts = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, { filters: filters });
    console.log(`Found ${accounts.length} token account(s) for wallet ${wallet}.`);

    for (const [i, account] of accounts.entries()) {
        const parsedAccountInfo: any = account.account.data;
        const mintAddress: string = parsedAccountInfo["parsed"]["info"]["mint"];
        const tokenBalance: number = parsedAccountInfo["parsed"]["info"]["tokenAmount"]["amount"];

        tokenBalance > 0 && portfolios.push({ mintAddress, tokenBalance });
    }
    return portfolios.sort((a: any, b: any) => b.tokenBalance - a.tokenBalance).slice(0, 30);

}

