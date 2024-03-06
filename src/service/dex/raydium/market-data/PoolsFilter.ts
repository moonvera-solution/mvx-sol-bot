import {
    Connection,
    PublicKey, Keypair, SendOptions,
    Signer,
    Transaction,
    VersionedTransaction,
} from "@solana/web3.js";
import base58 from "bs58";

import {
    MARKET_STATE_LAYOUT_V3, Liquidity, TokenAmount, LiquidityPoolKeys, Token, SPL_ACCOUNT_LAYOUT, InnerSimpleV0Transaction,
    LiquidityPoolKeysV4, TOKEN_PROGRAM_ID, TokenAccount, Market, SPL_MINT_LAYOUT, TxVersion, buildSimpleTransaction, LOOKUP_TABLE_CACHE, bool,
} from "@raydium-io/raydium-sdk";

import {
    connection,
} from "../../../../../config";
const programId = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

export async function getPoolKeys(data: any, baseMint: PublicKey): Promise<{ poolKeys: LiquidityPoolKeysV4, poolLaunchParams: any } | undefined> {
    let parsedData = JSON.parse(data);
    if (!parsedData.filters.includes('transactionsSubKey')) return undefined;
    let poolLaunchParams: any;
    let poolKeys: LiquidityPoolKeysV4 = {} as LiquidityPoolKeysV4;
    const info = parsedData.transaction;
    if (info && info.transaction && info.transaction.meta && info.transaction.meta.err !== undefined) return undefined;
    // if (info && info.transaction && info.transaction.meta && info.transaction.meta.logMessages.includes('open_time')) return undefined;

    if (parsedData.transaction.transaction.meta.logMessages) {
        let logMessages = Array.from(parsedData.transaction.transaction.meta.logMessages)
        poolLaunchParams = getPoolParams(logMessages);
    }

    const accounts = info.transaction.transaction.message.accountKeys.map((i: any) => base58.encode(i.data));
    for (const item of [
        ...info.transaction.transaction.message.instructions,
        ...info.transaction.meta.innerInstructions.map((i: any) => i.instructions).flat()
    ]) {

        if (accounts[item.programIdIndex] !== programId) continue;
        if ([...(item.data.data as Buffer).values()][0] != 1) continue;

        const keyIndex = [...(item.accounts.data as Buffer).values()]

        // filter for user's token
        if(accounts[keyIndex[4]] !== baseMint.toBase58()) continue;
        
        console.log('tokewn from filter', accounts[keyIndex[4]]);

        const [baseMintAccount, quoteMintAccount, marketAccount] = await connection.getMultipleAccountsInfo([
            new PublicKey(accounts[keyIndex[8]]),
            new PublicKey(accounts[keyIndex[9]]),
            new PublicKey(accounts[keyIndex[16]]),
        ], 'processed');

        if (baseMintAccount === null || quoteMintAccount === null || marketAccount === null) continue; //throw Error('get account info error')

        const baseMintInfo = SPL_MINT_LAYOUT.decode(baseMintAccount.data)

        const quoteMintInfo = SPL_MINT_LAYOUT.decode(quoteMintAccount.data)
        const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data)
        poolKeys = {
            id: new PublicKey(accounts[keyIndex[4]]),
            baseMint: new PublicKey(accounts[keyIndex[8]]),
            quoteMint: new PublicKey(accounts[keyIndex[9]]),
            lpMint: new PublicKey(accounts[keyIndex[7]]),
            baseDecimals: baseMintInfo.decimals,
            quoteDecimals: quoteMintInfo.decimals,
            lpDecimals: baseMintInfo.decimals,
            version: Number(4) as 4,
            programId: new PublicKey(programId),
            authority: new PublicKey(accounts[keyIndex[5]]),
            openOrders: new PublicKey(accounts[keyIndex[6]]),
            targetOrders: new PublicKey(accounts[keyIndex[12]]),
            baseVault: new PublicKey(accounts[keyIndex[10]]),
            quoteVault: new PublicKey(accounts[keyIndex[11]]),
            withdrawQueue: new PublicKey(PublicKey.default.toString()),
            lpVault: new PublicKey(PublicKey.default.toString()),
            marketVersion: 3,
            marketProgramId: new PublicKey(marketAccount.owner.toString()),
            marketId: new PublicKey(accounts[keyIndex[16]]),
            marketAuthority: new PublicKey(Market.getAssociatedAuthority({ programId: marketAccount.owner, marketId: new PublicKey(accounts[keyIndex[16]]) }).publicKey.toString()),
            marketBaseVault: new PublicKey(marketInfo.baseVault.toString()),
            marketQuoteVault: new PublicKey(marketInfo.quoteVault.toString()),
            marketBids: new PublicKey(marketInfo.bids.toString()),
            marketAsks: new PublicKey(marketInfo.asks.toString()),
            marketEventQueue: new PublicKey(marketInfo.eventQueue.toString()),
            lookupTableAccount: new PublicKey(PublicKey.default.toString())
        } as LiquidityPoolKeysV4;
    }
    return { poolKeys, poolLaunchParams };
}

function getPoolParams(logMessages: any) {
    const regex = /InitializeInstruction2\s*\{\s*nonce:\s*(\d+),\s*open_time:\s*(\d+),\s*init_pc_amount:\s*(\d+),\s*init_coin_amount:\s*(\d+)\s*\}/;
    for (const log of logMessages) {
        const match = log.match(regex);
        if (match != null) {
            return {
                nonce: match[1],
                open_time: match[2],
                init_quote_amount: match[3],
                init_coin_amount: match[4]
            }
        }
    }
}