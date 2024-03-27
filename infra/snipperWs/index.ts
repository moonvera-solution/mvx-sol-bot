import express from "express";
import Client, { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import base58 from "bs58";
import WebSocket from 'ws';
import { SecretsManagerClient, GetSecretValueCommand, } from "@aws-sdk/client-secrets-manager";
import axios from 'axios';
import mongoose from 'mongoose';
import dotenv from 'dotenv'; dotenv.config();
import { SnipeCache } from "../../src/db/mongo/schema";


import {
    Connection, TransactionMessage, Transaction, PublicKey, Keypair, SendOptions, Signer, SystemProgram, ComputeBudgetProgram,
    sendAndConfirmTransaction, VersionedTransaction, TransactionConfirmationStrategy
} from "@solana/web3.js";
import {
    MARKET_STATE_LAYOUT_V3, Liquidity, TokenAmount, LiquidityPoolKeys, Token, SPL_ACCOUNT_LAYOUT, InnerSimpleV0Transaction,
    LiquidityPoolKeysV4, TOKEN_PROGRAM_ID, TokenAccount, Market, SPL_MINT_LAYOUT, TxVersion, buildSimpleTransaction, LOOKUP_TABLE_CACHE, bool,
    LIQUIDITY_STATE_LAYOUT_V4,
} from "@raydium-io/raydium-sdk";
import { AnyAaaaRecord } from "dns";
export const SOL = new PublicKey('So11111111111111111111111111111111111111112');
export const AMMV4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');


const app = express();
app.use(express.json());
const port = 3010
/**
 * Sniper flow for: Bot - SnipperWs SMS - MongoDB
 * 
 * SMS Snipper web service
 * GWS Geyser web socket
 * ST Snipper table
 * 
 * Bot will handle duplicate basemint requests
 * If Pool not found with http geyser then => send to SMS
    * If ST basemint request not found
        *  Bot will send snipper ws request => 
        *  SMS will start GWS & store request on DB 
        *  SMS will update base mint status on DB
        *  When pool found, SMS will update token status on DB
        *  SMS will get all chat Ids that requested the token
        *  SMS will send push pool keys to bot Express enpoint 
        *  Bot will trigger buy on snipe or set schedule timeout
 */

let baseMint: string;
app.post('/sniper-ws/:baseMint', (async (req: any, res: any) => {
    console.log('sniper-ws receiving...');
    try {
        subNewAmmPool(req.params.baseMint);
        await _initDbConnection();
        baseMint = req.params.baseMint;
    } catch (e: any) {
        console.log("geyser got what it needs", e)
    }
    res.send(true);
}));

app.listen(port, () => {
    console.log('Server is running on port', port);
});

const ws = new Connection(
    'https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41',
    { wsEndpoint: `wss://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41/whirligig` }
);
let subscriptionId: number | null = null;

function wsCallBack(data: any) {
    console.log('wsCallBack-subscriptionId', subscriptionId); // not updating FIXME
    SnipeCache.findOne({ baseMint: baseMint }).then((snipeQueue: any) => {
        console.log('snipeQueue', snipeQueue);

        let isDone = false
        snipeQueue.chatIds.forEach(async (id: any) => {
            console.log(id);
            await axios.post(`http://localhost:${snipeQueue.port}/sniper-ws/${baseMint}/${id}`);
            if (snipeQueue.chatIds.indexOf(id) == snipeQueue.chatIds.length) isDone = true;
        });

        // Remove the account change listener after processing the data
        if (subscriptionId !== null) {
            console.log('removing ws listener');
            ws.removeAccountChangeListener(subscriptionId);
            subscriptionId = null; // Reset the subscriptionId after removing the listener
        }
        if (isDone) SnipeCache.deleteOne({ baseMint }).then(() => {});
        return data;
    });
}

function subNewAmmPool(baseMint: string) {
    console.log('MicroService Ws on', baseMint);
    ws.onAccountChange(new PublicKey('cVsN11LTUjictK1sUMsxdT5J2PKxZcJ858RXKNVuuZ4'), wsCallBack, 'processed');
    // return ws.onProgramAccountChange(AMMV4, wsCallBack, 'processed', _accountFilter(new PublicKey(baseMint), SOL));
}

const openRequest = {
    slots: {},
    accounts: {},
    transactions: {
        transactionsSubKey: {
            accountInclude: ['7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5'],
            accountExclude: [],
            accountRequired: []
        }
    },
    blocks: {},
    blocksMeta: {},
    accountsDataSlice: [],
    entry: {},
    commitment: CommitmentLevel.PROCESSED,
}

const _accountFilter = (baseMint: PublicKey, quoteMint: PublicKey) => [
    { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
    {
        memcmp: {
            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint"),
            bytes: baseMint.toBase58(),
        },
    },
    {
        memcmp: {
            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint"),
            bytes: quoteMint.toBase58(),
        },
    },
]

const specificRequest = (baseMint: PublicKey) => {
    const SOL = new PublicKey("So11111111111111111111111111111111111111112");
    return {
        "slots": {},
        "accounts": {
            transactionsSubKey: {
                "account": ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"],// Raydiumv4 program
                "owner": [],
                "filters": [{
                    datasize: LIQUIDITY_STATE_LAYOUT_V4.span.toString(),
                }, {
                    "memcmp": {
                        "offset": LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint").toString(),
                        "base58": `${baseMint.toBase58()}`
                    }
                },
                {
                    "memcmp": {
                        "offset": LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint").toString(),
                        "base58": `${SOL.toBase58()}`
                    }
                }]
            }
        },
        "transactions": {},
        "blocks": {},
        "blocksMeta": {},
        "entry": {},
        "commitment": CommitmentLevel.PROCESSED,
        "accountsDataSlice": [{ "offset": String(0), "length": String(165) }]
    }
}

async function _getPoolKeys(data: any, baseMint: string, connection: Connection): Promise<{ poolKeys: LiquidityPoolKeysV4, poolLaunchParams: any } | undefined> {
    let poolLaunchParams: any;
    let poolKeys: LiquidityPoolKeysV4 = {} as LiquidityPoolKeysV4;
    let parsedData = JSON.parse(data);
    if (!parsedData.filters.includes('transactionsSubKey')) return undefined;
    const info = parsedData.transaction;
    if (info && info.transaction && info.transaction.meta && info.transaction.meta.err !== undefined) return undefined;

    if (parsedData.transaction.transaction.meta.logMessages) {
        let logMessages = Array.from(parsedData.transaction.transaction.meta.logMessages)
        poolLaunchParams = _getPoolParams(logMessages);
    }

    const accounts = info.transaction.transaction.message.accountKeys.map((i: any) => base58.encode(i.data));
    for (const item of [
        ...info.transaction.transaction.message.instructions,
        ...info.transaction.meta.innerInstructions.map((i: any) => i.instructions).flat()
    ]) {

        // raydiumv4 program Id
        const programId = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";

        // filter by user requested baseMint
        if (accounts[item.programIdIndex] !== programId) continue;

        if ([...(item.data.data as Buffer).values()][0] != 1) continue;

        const keyIndex = [...(item.accounts.data as Buffer).values()]

        // if (accounts[keyIndex[8]] != baseMint) continue;

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

function _getPoolParams(logMessages: any) {
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


const user = encodeURIComponent(process.env.DB_USER!);
const password = encodeURIComponent(process.env.DB_PASSWORD!);
const isProd = process.env.NODE_ENV == 'PROD';
const local_url = `mongodb://127.0.0.1:27017/test`;

// https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/getting-started.html
export async function anon(): Promise<any> {
    const secret_name = "mvx-bot-db"
    const client = new SecretsManagerClient({
        region: "ca-central-1",
    });

    let response;

    try {
        response = await client.send(
            new GetSecretValueCommand({
                SecretId: secret_name,
                VersionStage: "AWSCURRENT", // VersionStage defaults to AWSCURRENT if unspecified
            })
        );
    } catch (error: any) {
        // For a list of exceptions thrown, see
        // https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
        throw error;
    }
    return response.SecretString;
}
/**
 * All DB functions are prefized with an underscore (_)
 */
export async function _initDbConnection() {
    // const db =  await mongoose.connect(local_url, { useNewUrlParser: true, useUnifiedTopology: true });
    const _anon = isProd ? await anon() : null;
    mongoose.connect(local_url, {
        /** Set to false to [disable buffering](http://mongoosejs.com/docs/faq.html#callback_never_executes) on all models associated with this connection. */
        /** The name of the database you want to use. If not provided, Mongoose uses the database name from connection string. */
        dbName: 'test',
        /** username for authentication, equivalent to `options.auth.user`. Maintained for backwards compatibility. */
        user: isProd ? _anon.user : user,
        autoIndex: true,
        /** password for authentication, equivalent to `options.auth.password`. Maintained for backwards compatibility. */
        pass: isProd ? _anon.pw : password,
    });
    const db = mongoose.connection;
    db.on('error', console.error.bind(console, 'ERR connection error:'));
    db.once('open', function () {
        console.log("Connected to DB");
    });
}
