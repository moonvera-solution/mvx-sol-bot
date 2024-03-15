import {
    buildSimpleTransaction,
    findProgramAddress,
    InnerSimpleV0Transaction,
    SPL_ACCOUNT_LAYOUT,
    TOKEN_PROGRAM_ID,
    TokenAccount,
    LiquidityPoolKeys, Liquidity, TokenAmount, Token, Percent, publicKey
} from '@raydium-io/raydium-sdk';
import { Metaplex } from "@metaplex-foundation/js";
import axios from 'axios';

import {
    Connection,
    Keypair,
    PublicKey,
    SendOptions,
    Signer,
    Transaction,
    VersionedTransaction,
    TransactionMessage,
    sendAndConfirmTransaction,
    LAMPORTS_PER_SOL,
    TransactionInstruction,
    Commitment,
    SystemProgram
} from '@solana/web3.js';

import {
    addLookupTableInfo,
    connection,
    makeTxVersion
} from '../../../config';

// define some default locations
const DEFAULT_KEY_DIR_NAME = "local_keys";
const DEFAULT_PUBLIC_KEY_FILE = "keys.json";
const DEFAULT_DEMO_DATA_FILE = "demo.json";

import bs58 from 'bs58';
import fs from "fs";
import path from "path";

export async function sendTx(
    connection: Connection,
    payer: Keypair | Signer,
    txs: (VersionedTransaction | Transaction)[],
    options?: SendOptions
): Promise<string[]> {
    const txids: string[] = [];
    for (const iTx of txs) {
        if (iTx instanceof VersionedTransaction) {
            console.log("sending versioned");
            iTx.sign([payer]);
            let ixId = await connection.sendTransaction(iTx, options)
            txids.push(ixId);
            
        } else {
            console.log("sending versioned");
            txids.push(await connection.sendTransaction(iTx, [payer], options));
        }
    }
    return txids;
}

export async function getWalletTokenAccount(connection: Connection, wallet: PublicKey): Promise<TokenAccount[]> {
    const walletTokenAccount = await connection.getTokenAccountsByOwner(wallet, {
        programId: TOKEN_PROGRAM_ID,
    });
    return walletTokenAccount.value.map((i) => ({
        pubkey: i.pubkey,
        programId: i.account.owner,
        accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
    }));
}

export async function buildTx(innerSimpleV0Transaction: InnerSimpleV0Transaction[], options?: SendOptions):
    Promise<(VersionedTransaction | Transaction)[]> {
    return await buildSimpleTransaction({
        connection,
        makeTxVersion,
        payer: new PublicKey(innerSimpleV0Transaction[0].signers[0]),
        innerTransactions: innerSimpleV0Transaction,
        addLookupTableInfo: addLookupTableInfo,
    });
}

export async function buildAndSendTx(keypair: Keypair, innerSimpleV0Transaction: InnerSimpleV0Transaction[], options?: SendOptions) {
    const willSendTx: (VersionedTransaction | Transaction)[] = await buildSimpleTransaction({
        connection,
        makeTxVersion,
        payer: keypair.publicKey,
        innerTransactions: innerSimpleV0Transaction,
        addLookupTableInfo: addLookupTableInfo,
    });
    return await sendTx(connection, keypair, willSendTx, options)
}

// export function getATAAddress(programId: PublicKey, owner: PublicKey, mint: PublicKey) {
//   const { publicKey, nonce } = findProgramAddress(
//     [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
//     new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
//   );
//   return { publicKey, nonce };
// }

export async function sleepTime(ms: number) {
    console.log((new Date()).toLocaleString(), 'sleepTime', ms)
    return new Promise(resolve => setTimeout(resolve, ms))
}


export async function getKeyPair(secretKey: string): Promise<Keypair> {
    return Keypair.fromSecretKey(bs58.decode(secretKey!));
}


/**
 * Wrie a function to store json object on an external file, and updated constantly to persist
 */
export function writeJsonToFile(data: any, fileName: string) {
    try {
        const jsonString = JSON.stringify(data);
        fs.writeFileSync(fileName, jsonString);
    } catch (error: any) {
        console.error(error.message);
    }
}

export function loadPublicKeysFromFile(
    absPath: string = `${DEFAULT_KEY_DIR_NAME}/${DEFAULT_PUBLIC_KEY_FILE}`,
) {
    try {
        if (!absPath) throw Error("No path provided");
        if (!fs.existsSync(absPath)) throw Error("File does not exist.");

        // load the public keys from the file
        const data = JSON.parse(fs.readFileSync(absPath, { encoding: "utf-8" })) || {};

        // convert all loaded keyed values into valid public keys
        for (const [key, value] of Object.entries(data)) {
            data[key] = new PublicKey(value as string) ?? "";
        }

        return data;
    } catch (err) {
        // console.warn("Unable to load local file");
    }
    // always return an object
    return {};
}

/*
  Locally save a PublicKey addresses to the filesystem for later retrieval
*/
export function savePublicKeyToFile(
    name: string,
    publicKey: PublicKey,
    absPath: string = `${DEFAULT_KEY_DIR_NAME}/${DEFAULT_PUBLIC_KEY_FILE}`,
) {
    try {
        // if (!absPath) throw Error("No path provided");
        // if (!fs.existsSync(absPath)) throw Error("File does not exist.");

        // fetch all the current values
        let data: any = loadPublicKeysFromFile(absPath);

        // convert all loaded keyed values from PublicKeys to strings
        for (const [key, value] of Object.entries(data)) {
            data[key as any] = (value as PublicKey).toBase58();
        }
        data = { ...data, [name]: publicKey.toBase58() };

        // actually save the data to the file
        fs.writeFileSync(absPath, JSON.stringify(data), {
            encoding: "utf-8",
        });

        // reload the keys for sanity
        data = loadPublicKeysFromFile(absPath);

        return data;
    } catch (err) {
        console.warn("Unable to save to file");
    }
    // always return an object
    return {};
}

/*
  Load a locally stored JSON keypair file and convert it to a valid Keypair
*/
export function loadKeypairFromFile(absPath: string, chatId: string): Keypair {
    let sk: any = undefined;
    try {
        if (!absPath) throw Error("No path provided");
        if (!fs.existsSync(absPath)) throw Error("File does not exist.");

        // load the keypair from the file
        const keyfileBytes = JSON.parse(fs.readFileSync(absPath, { encoding: "utf-8" }));
        let secretKey = keyfileBytes[chatId.toString()].privateKey
        console.log("secretKey", secretKey)
        secretKey = bs58.decode(secretKey.toString());
        sk = Keypair.fromSecretKey(secretKey);

    } catch (err) {
        sk = undefined
        throw console.log("ERROR loadKeypairFromFile", err);
    }
    return sk;
}

/*
  Save a locally stored JSON keypair file for later importing
*/
export function saveKeypairToFile(
    keypair: Keypair,
    fileName: string,
    dirName: string = DEFAULT_KEY_DIR_NAME,
) {
    fileName = path.join(dirName, `${fileName}.json`);

    // create the `dirName` directory, if it does not exists
    if (!fs.existsSync(`./${dirName}/`)) fs.mkdirSync(`./${dirName}/`);

    // remove the current file, if it already exists
    if (fs.existsSync(fileName)) fs.unlinkSync(fileName);

    // write the `secretKey` value as a string
    fs.writeFileSync(fileName, `[${keypair.secretKey.toString()}]`, {
        encoding: "utf-8",
    });

    return fileName;
}

/*
  Attempt to load a keypair from the filesystem, or generate and save a new one
*/
export function loadOrGenerateKeypair(chaidId: string, fileName: string, dirName: string = DEFAULT_KEY_DIR_NAME) {
    try {
        // compute the path to locate the file
        const searchPath = path.join(dirName, `${fileName}.json`);
        let keypair = Keypair.generate();

        // attempt to load the keypair from the file
        if (fs.existsSync(searchPath)) keypair = loadKeypairFromFile(searchPath, chaidId);
        // when unable to locate the keypair, save the new one
        else saveKeypairToFile(keypair, fileName, dirName);

        return keypair;
    } catch (err) {
        console.error("loadOrGenerateKeypair:", err);
        throw err;
    }
}

/*
  Compute the Solana explorer address for the various data
*/
export function explorerURL({
    address,
    txSignature,
    cluster,
}: {
    address?: string;
    txSignature?: string;
    cluster?: "devnet" | "testnet" | "mainnet" | "mainnet-beta";
}) {
    let baseUrl: string;
    //
    if (address) baseUrl = `https://explorer.solana.com/address/${address}`;
    else if (txSignature) baseUrl = `https://explorer.solana.com/tx/${txSignature}`;
    else return "[unknown]";

    // auto append the desired search params
    const url = new URL(baseUrl);
    url.searchParams.append("cluster", cluster || "devnet");
    return url.toString() + "\n";
}

/**
 * Auto airdrop the given wallet of of a balance of < 0.5 SOL
 */
export async function airdropOnLowBalance(
    connection: Connection,
    keypair: Keypair,
    forceAirdrop: boolean = false,
) {
    // get the current balance
    let balance = await connection.getBalance(keypair.publicKey);

    // define the low balance threshold before airdrop
    const MIN_BALANCE_TO_AIRDROP = LAMPORTS_PER_SOL / 2; // current: 0.5 SOL

    // check the balance of the two accounts, airdrop when low
    if (forceAirdrop === true || balance < MIN_BALANCE_TO_AIRDROP) {
        console.log(`Requesting airdrop of 1 SOL to ${keypair.publicKey.toBase58()}...`);
        await connection.requestAirdrop(keypair.publicKey, LAMPORTS_PER_SOL).then(sig => {
            console.log("Tx signature:", sig);
            // balance = balance + LAMPORTS_PER_SOL;
        });

        // fetch the new balance
        // const newBalance = await connection.getBalance(keypair.publicKey);
        // return newBalance;
    }
    // else console.log("Balance of:", balance / LAMPORTS_PER_SOL, "SOL");

    return balance;
}

/*
  Helper function to extract a transaction signature from a failed transaction's error message
*/
export async function extractSignatureFromFailedTransaction(
    connection: Connection,
    err: any,
    fetchLogs?: boolean,
) {
    if (err?.signature) return err.signature;

    // extract the failed transaction's signature
    const failedSig = new RegExp(/^((.*)?Error: )?(Transaction|Signature) ([A-Z0-9]{32,}) /gim).exec(
        err?.message?.toString(),
    )?.[4];

    // ensure a signature was found
    if (failedSig) {
        // when desired, attempt to fetch the program logs from the cluster
        if (fetchLogs)
            await connection
                .getTransaction(failedSig, {
                    maxSupportedTransactionVersion: 0,
                })
                .then(tx => {
                    console.log(`\n==== Transaction logs for ${failedSig} ====`);
                    console.log(explorerURL({ txSignature: failedSig }), "");
                    console.log(tx?.meta?.logMessages ?? "No log messages provided by RPC");
                    console.log(`==== END LOGS ====\n`);
                });
        else {
            console.log("\n========================================");
            console.log(explorerURL({ txSignature: failedSig }));
            console.log("========================================\n");
        }
    }

    // always return the failed signature value
    return failedSig;
}
export async function getSolBalance(publicKeyString: any) {
    const publicKey = new PublicKey(publicKeyString);
    try {
        const balance = await connection.getBalance(publicKey);
        return balance / LAMPORTS_PER_SOL; // Convert lamports to SOL
    } catch (error: any) {
        console.error('Error fetching SOL balance:', error.message);
        return 0;
    }
}
/*
  Standard number formatter
*/
export function numberFormatter(num: number, forceDecimals = false) {
    // set the significant figures
    const minimumFractionDigits = num < 1 || forceDecimals ? 10 : 2;

    // do the formatting
    return new Intl.NumberFormat(undefined, {
        minimumFractionDigits,
    }).format(num);
}

export function generateSolanaWallet() {
    console.info('Generating SolanaWallet...');
    const wallet = Keypair.generate();
    const publicKey = wallet.publicKey.toBase58();
    const secretKey: Uint8Array = wallet.secretKey; // This needs to be handled securely
    return { publicKey, secretKey };
}


/*
  Display a separator in the console, with our without a message
*/
export function printConsoleSeparator(message?: string) {
    console.log("\n===============================================");
    console.log("===============================================\n");
    if (message) console.log(message);
}

/**
 * Helper function to build a signed transaction
 */
export async function buildTransaction({
    connection,
    payer,
    signers,
    instructions,
}: {
    connection: Connection;
    payer: PublicKey;
    signers: Keypair[];
    instructions: TransactionInstruction[];
}): Promise<VersionedTransaction> {
    let blockhash = await connection.getLatestBlockhash().then(res => res.blockhash);

    const messageV0 = new TransactionMessage({
        payerKey: payer,
        recentBlockhash: blockhash,
        instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);

    // signers.forEach(s => tx.sign([s]));

    return tx;
}


export async function getTokenAccountsByOwner(
    connection: Connection,
    owner: PublicKey,
) {
    const tokenResp = await connection.getTokenAccountsByOwner(
        owner,
        {
            programId: TOKEN_PROGRAM_ID
        },
    );

    const accounts: TokenAccount[] = [];

    for (const { pubkey, account } of tokenResp.value) {
        accounts.push({
            programId: pubkey,
            pubkey: pubkey,
            accountInfo: SPL_ACCOUNT_LAYOUT.decode(account.data)
        });
    }

    return accounts;
}

export function _getESTime() {
    const date = new Date();
    const utcDate = new Date(date.toUTCString());
    utcDate.setHours(utcDate.getHours() - 5);
    const usDate = new Date(utcDate);
    return (usDate);
}

/**
 * swapInDirection: used to determine the direction of the swap
 * Eg: RAY_SOL_LP_V4_POOL_KEY is using SOL as quote token, RAY as base token
 * If the swapInDirection is true, currencyIn is RAY and currencyOut is SOL
 * vice versa
 */
export async function calcAmountOut(connection: Connection, poolKeys: LiquidityPoolKeys, rawAmountIn: number, swapInDirection: boolean) {
    const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys });

    let currencyInMint = poolKeys.baseMint;
    let currencyInDecimals = poolInfo.baseDecimals;
    let currencyOutMint = poolKeys.quoteMint;
    let currencyOutDecimals = poolInfo.quoteDecimals;

    if (!swapInDirection) {
        currencyInMint = poolKeys.quoteMint;
        currencyInDecimals = poolInfo.quoteDecimals;
        currencyOutMint = poolKeys.baseMint;
        currencyOutDecimals = poolInfo.baseDecimals;
    }

    const currencyIn = new Token(poolKeys.quoteMint, currencyInMint, currencyInDecimals);
    const amountIn = new TokenAmount(currencyIn, rawAmountIn, false);
    const currencyOut = new Token(poolKeys.baseMint, currencyOutMint, currencyOutDecimals);
    const slippage = new Percent(5, 100); // 5% slippage


    const {
        amountOut,
        minAmountOut,
        currentPrice,
        executionPrice,
        priceImpact,
        fee,
    } = Liquidity.computeAmountOut({ poolKeys, poolInfo, amountIn, currencyOut, slippage, });

    return {
        amountIn,
        amountOut,
        minAmountOut,
        currentPrice,
        executionPrice,
        priceImpact,
        fee,
    };
}

function formatSupply(rawSupply: any) {
    console.log("rawSupply", rawSupply)
    const divisor = Math.pow(10, 9); // Dynamically set based on token's decimals
    const supply = rawSupply / divisor;
    let formattedSupply;

    if (rawSupply >= 1e9) { // Billion
        formattedSupply = ((rawSupply / 1e9).toFixed(2)).toString() + ' B';
    } else if (rawSupply >= 1e6) { // Million
        formattedSupply = ((rawSupply / 1e6).toFixed(2)).toString() + ' M';
    } else if (rawSupply >= 1e3) { // Thousand
        formattedSupply = ((rawSupply / 1e3).toFixed(2).toString()) + ' Thousand';
    } else {
        formattedSupply = (rawSupply.toFixed(2).toString()); // Less than thousand
    }
    console.log("formattedSupply", formattedSupply)
    return formattedSupply;
}

export async function formatNumberToKOrM(number: number) {
    if (number < 1e3) {
        return number.toFixed(2); // Less than a thousand
    } else if (number >= 1e3 && number < 1e6) {
        return (number / 1e3).toFixed(2) + 'K'; // Thousands
    } else if (number >= 1e6 && number < 1e9) {
        return (number / 1e6).toFixed(2) + 'M'; // Millions
    } else {
        return (number / 1e9).toFixed(2) + 'B'; // Billions
    }
    return null;
}

export async function sendSol(ctx: any, recipientAddress: PublicKey, solAmount: number) {
    const chatId = ctx.chat.id;
    const session = ctx.session;
    const userWallet = session.portfolio.wallets[session.activeWalletIndex];
    const userSecretKey = userWallet.secretKey; // User's secret key
    const userPublicKey = userWallet.publicKey; // User's public key
    const amount = solAmount * LAMPORTS_PER_SOL; // Convert SOL to lamports
    // Create a transaction
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: new PublicKey(userPublicKey),
            toPubkey: recipientAddress,
            lamports: amount,
        })
    );
    // Create a Keypair from the secret key
    const senderKeypair = Keypair.fromSecretKey(bs58.decode(String(userSecretKey)))
    console.log("senderKeypair", senderKeypair)
    try {
        // Sign and send the transaction
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [senderKeypair],
            { commitment: 'processed' }
        );

const solscanUrl = `https://solscan.io/tx/${signature}`;

await ctx.api.sendMessage(chatId, `💸 Sent ${solAmount} SOL to ${recipientAddress.toBase58()}.\nView on Solscan: ${solscanUrl}`);
    } catch (error) {
        console.error("Transaction Error:", error);
        await ctx.api.sendMessage(chatId, "Transaction failed. Please try again later.");
    }
}

async function getTokenDescription(tokenUri: string) {
    try {
        const response = await axios.get(tokenUri); // Fetch the URI content
        const metadata = response.data; // Parse the content as JSON
        return metadata.description; // Extract the description
    } catch (error: any) {
        console.error('Error fetching token description:', error.message);
        return null; // Return null or a default description
    }
}
export function isValidBase58(str: any) {
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return base58Regex.test(str);
}
