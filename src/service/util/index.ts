import {
    buildSimpleTransaction,
    InnerSimpleV0Transaction,
    SPL_ACCOUNT_LAYOUT,
    TOKEN_PROGRAM_ID,
    TokenAccount,
    LiquidityPoolKeys, Liquidity, TokenAmount, Token, Percent, publicKey
} from '@raydium-io/raydium-sdk';
import {CONNECTION} from '../../config';
import { UserPositions,Referrals } from '../../db/mongo/schema';
import { saveUserPosition } from '../../service/portfolio/positions';

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
    SystemProgram,
    MessageV0,
} from '@solana/web3.js';

import {
    addLookupTableInfo,
    RAYDIUM_AUTHORITY, MVXBOT_FEES,
    makeTxVersion, WALLET_MVX
} from '../../config';

// define some default locations
const DEFAULT_KEY_DIR_NAME = "local_keys";
const DEFAULT_PUBLIC_KEY_FILE = "keys.json";
const DEFAULT_DEMO_DATA_FILE = "demo.json";

import bs58 from 'bs58';
import fs from "fs";
import path from "path";
import BigNumber from 'bignumber.js';
import { Instruction } from '@coral-xyz/anchor';
import { Key } from 'readline';

export async function sendTx(
    connection: Connection,
    payer: Keypair | Signer,
    txs: (VersionedTransaction | Transaction)[],
    options?: SendOptions
): Promise<string[]> {
    const txids: string[] = [];
    for (const iTx of txs) {
        if (iTx instanceof VersionedTransaction) {
            iTx.sign([payer]);
            let ixId = await connection.sendRawTransaction(iTx.serialize(), options);
            console.log("sending versioned tx", ixId);
            txids.push(ixId);
        } else {
            console.log("sending legacy tx");
            txids.push(await connection.sendTransaction(iTx, [payer], options));
        }
    }
    return txids;
}

export async function getWalletTokenAccount(connection: Connection, wallet: PublicKey): Promise<TokenAccount[]> {
    const walletTokenAccount = await connection.getTokenAccountsByOwner(wallet, {
        programId: TOKEN_PROGRAM_ID,
    }, 'processed');
    return walletTokenAccount.value.map((i) => ({
        pubkey: i.pubkey,
        programId: i.account.owner,
        accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
    }));
}

export async function buildTx(innerSimpleV0Transaction: InnerSimpleV0Transaction[], connection: Connection, options?: SendOptions):
    Promise<(VersionedTransaction | Transaction)[]> {
    return await buildSimpleTransaction({
        connection,
        makeTxVersion,
        payer: new PublicKey(innerSimpleV0Transaction[0].signers[0]),
        innerTransactions: innerSimpleV0Transaction,
        addLookupTableInfo: addLookupTableInfo,
    });
}

export async function buildAndSendTx(keypair: Keypair, innerSimpleV0Transaction: InnerSimpleV0Transaction[], connection: Connection, options?: SendOptions) {
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
export async function getSolBalance(publicKeyString: any, connection: Connection) {
    const publicKey = publicKeyString instanceof PublicKey ? publicKeyString : new PublicKey(publicKeyString);
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
    const userWallet = session.portfolio.wallets[session.portfolio.activeWalletIndex];
    const userSecretKey = userWallet.secretKey; // User's secret key
    const userPublicKey = userWallet.publicKey; // User's public key
    const amount = solAmount * LAMPORTS_PER_SOL; // Convert SOL to lamports
    const connection = CONNECTION;
    const senderKeypair = Keypair.fromSecretKey(bs58.decode(String(userSecretKey)))

    // Create a transaction
    const transaction = new Transaction().add(
        (await addMvxFeesInx(senderKeypair, new BigNumber(amount))[0]),
        SystemProgram.transfer({
            fromPubkey: new PublicKey(userPublicKey),
            toPubkey: recipientAddress,
            lamports: amount,
        })
    );

    // Create a Keypair from the secret key
    // console.log("senderKeypair", senderKeypair)
    try {
        // Sign and send the transaction
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [senderKeypair],
            { commitment: 'processed' }
        );

        const solscanUrl = `https://solscan.io/tx/${signature}`;

        await ctx.api.sendMessage(chatId, `💸 Sent ${solAmount} SOL to ${recipientAddress.toBase58()}.\nView on Solscan: ${solscanUrl}`, { parse_mode: 'HTML', disable_web_page_preview: true });
    } catch (error) {
        console.error("Transaction Error:", error);
        await ctx.api.sendMessage(chatId, "Transaction failed. Please try again later.");
    }
}

export function isValidBase58(str: any) {
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return base58Regex.test(str);
}

export async function waitForConfirmation(ctx: any, txid: string): Promise<boolean> {
    let isConfirmed = false;
    const maxAttempts = 300;
    let attempts = 0;
    try {
        while (!isConfirmed && attempts < maxAttempts) {
            attempts++;
            const connection = CONNECTION;
            console.log(`Attempt ${attempts}/${maxAttempts} to confirm transaction`);
            const config = {
                searchTransactionHistory: true
            };
            const sigStatus = await connection.getSignatureStatus(txid, config)
            console.log("sigStatus", sigStatus.value?.err)
            console.log("sigConfrms", sigStatus.value?.confirmations)
            if (sigStatus.value && sigStatus.value?.err == null && sigStatus.value?.confirmations && sigStatus.value?.confirmationStatus === 'confirmed') {
                console.log('Transaction is confirmed.');
                isConfirmed = true;
            }
        }
        return isConfirmed;
    } catch (error: any) {
        console.error('Error waiting for confirmation:', error.message);
        return false;

    }
}
export async function waitForConfirmationPump(ctx: any, txid: string): Promise<boolean> {
    let isConfirmed = false;
    const maxAttempts = 300;
    let attempts = 0;
    try {
        while (!isConfirmed && attempts < maxAttempts) {
            attempts++;
            const connection = CONNECTION;
            console.log(`Attempt ${attempts}/${maxAttempts} to confirm transaction`);
            const config = {
                searchTransactionHistory: true
            };
            const sigStatus = await connection.getSignatureStatus(txid, config)
            console.log("sigStatus", sigStatus.value?.err)
            console.log("sigConfrms", sigStatus.value?.confirmations)
            if (sigStatus.value && sigStatus.value?.err == null && sigStatus.value?.confirmations && sigStatus.value?.confirmationStatus === 'confirmed') {
                console.log('Transaction is confirmed.');
                isConfirmed = true;
            } else if (sigStatus.value?.err) {
                await ctx.api.sendMessage(ctx.chat.id, `❌ Transaction failed!.`);
                console.log('Transaction pump failed:', sigStatus.value?.err);
                return false;
            }
        }
        return isConfirmed;
    } catch (error: any) {
        console.error('Error waiting for confirmation:', error.message);
        return false;

    }
}

export function getPriorityFeeLabel(fee: number): string {
    let priorityFeeLabel;
    switch (fee) {

        case 5000:
            priorityFeeLabel = 'low';
            break;
        case 7500:
            priorityFeeLabel = 'medium';
            break;
        case 10000:
            priorityFeeLabel = 'high';
            break;
    }
    return String(priorityFeeLabel);
}
// export async function trackUntilFinalized(ctx: any, txid: string): Promise<boolean> {


export function getTokenExplorerURLS(tokenAddress: string): { birdeyeURL: any; dextoolsURL: string; dexscreenerURL: string; } {
    return {
        birdeyeURL: `https://birdeye.so/token/${tokenAddress}?chain=solana`,
        dextoolsURL: `https://www.dextools.io/app/solana/pair-explorer/${tokenAddress}`,
        dexscreenerURL: `https://dexscreener.com/solana/${tokenAddress}`,
    }
}

export async function getSwapAmountOut(
    connection: Connection,
    txids: string,
) {
    let extractAmount: number = 0;
    let counter = 0;

    while (extractAmount == 0 && counter < 100) { // it has to find it since its a transfer tx
        counter++;
        const txxs = await connection.getParsedTransaction(txids, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
        let txAmount: Array<any> | undefined;
        if (txxs && txxs.meta && txxs.meta.innerInstructions && txxs.meta.innerInstructions) {
            txxs.meta.innerInstructions.forEach((tx) => {
                txAmount = JSON.parse(JSON.stringify(tx.instructions));
                txAmount = !Array.isArray(txAmount) ? [txAmount] : txAmount;
                txAmount.forEach((tx) => {
                    if (tx.parsed.info.authority == RAYDIUM_AUTHORITY) {
                        extractAmount = tx.parsed.info.amount;
                    }
                    console.log('inner tx: ', JSON.parse(JSON.stringify(tx)));
                });
            })
        }
    }
    return extractAmount;
}

export async function getSwapAmountOutPump(
    connection: Connection,
    txids: string,
    tradeSide: string
) {
    let extractAmount: number = 0;
    let counter = 0;

    while (extractAmount == 0 && counter < 30) { // it has to find it since its a transfer tx
        counter++;
        const txxs = await connection.getParsedTransaction(txids, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }).catch((e) => console.error("Error on getSwapAmountOutPump", e.message, txids));
        let txAmount: Array<any> | undefined;
        if (txxs && txxs.meta && txxs.meta.innerInstructions && txxs.meta.innerInstructions) {
            txxs.meta.innerInstructions.forEach((tx) => {
                txAmount = JSON.parse(JSON.stringify(tx.instructions));
                txAmount = !Array.isArray(txAmount) ? [txAmount] : txAmount;
                txAmount.forEach((tx) => {
                    if (tradeSide == 'buy' && tx.parsed && tx.parsed?.info && (tx.parsed.info.amount || tx.parsed.info.tokenAmount)) {

                        extractAmount = tx.parsed.info.amount ? tx.parsed.info.amount : tx.parsed.info.tokenAmount.amount;
                    } else if (tradeSide == 'sell' && txxs && txxs.meta && txxs.meta.postBalances && txxs.meta.preBalances) {
                        extractAmount = txxs.meta.postBalances[0] - txxs.meta.preBalances[0];
                    }

                });
            })
        }
    }
    return extractAmount;
}
export async function getSwapAmountOutCpmm(
    connection: Connection,
    txids: string,
    tradeSide: string
) {
    let extractAmount: number = 0;
    let counter = 0;

    while (extractAmount == 0 && counter < 30) { // it has to find it since its a transfer tx
        counter++;
        const txxs = await connection.getParsedTransaction(txids, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }).catch((e) => console.error("Error on getSwapAmountOutPump", e.message, txids));
        let txAmount: Array<any> | undefined;
        if (txxs && txxs.meta && txxs.meta.innerInstructions && txxs.meta.innerInstructions) {
            txxs.meta.innerInstructions.forEach((tx) => {
                txAmount = JSON.parse(JSON.stringify(tx.instructions));
                txAmount = !Array.isArray(txAmount) ? [txAmount] : txAmount;
                txAmount.forEach((tx) => {
                    if (tradeSide == 'buy' && tx.parsed && tx.parsed?.info && (tx.parsed.info.amount || tx.parsed.info.tokenAmount)) {
                        console.log("tx.parsed.info", tx.parsed.info)
                        extractAmount = tx.parsed.info.amount ? tx.parsed.info.amount : tx.parsed.info.tokenAmount.amount;
                    } else if (tradeSide == 'sell' && txxs && txxs.meta && txxs.meta.postBalances && txxs.meta.preBalances) {
                        console.log("txxs.meta", txxs.meta)
                        extractAmount = txxs.meta.postBalances[0] - txxs.meta.preBalances[0];
                    }

                });
            })
        }
    }
    return extractAmount;
}
/**
 * @notice Only use if there is a referral
 * @returns TransactionInstruction Array
 */
export function add_mvx_and_ref_inx_fees(
    payerKeypair: Keypair,
    referralWallet: string,
    solAmount: BigNumber,
    referralCommision: number): TransactionInstruction[] {

    const mvxFee = solAmount.multipliedBy(MVXBOT_FEES);
    let referralAmmount = mvxFee.multipliedBy(referralCommision).dividedBy(10_000);
    let mvxFeeAfterRefeeralCut = mvxFee.minus(referralAmmount);

    const referralInx = SystemProgram.transfer({
        fromPubkey: payerKeypair.publicKey,
        toPubkey: new PublicKey(referralWallet),
        lamports: new BigNumber(Math.ceil(Number.parseFloat(String(referralAmmount.toNumber())))).toNumber(),
    });

    const mvxFeeInx = SystemProgram.transfer({
        fromPubkey: payerKeypair.publicKey,
        toPubkey: new PublicKey(WALLET_MVX),
        lamports: new BigNumber(Math.ceil(Number.parseFloat(String(mvxFeeAfterRefeeralCut.toNumber())))).toNumber(),

    });
    return [referralInx, mvxFeeInx];
}

/**
 * @notice Only use if there is NO referral
 * @returns TransactionInstruction Array
 */
export function addMvxFeesInx(payerKeypair: Keypair, solAmount: BigNumber): TransactionInstruction[] {
    let mvxFee: BigNumber = solAmount.multipliedBy(MVXBOT_FEES);
    return [SystemProgram.transfer({
        fromPubkey: payerKeypair.publicKey,
        toPubkey: new PublicKey(WALLET_MVX),
        lamports: Math.ceil(mvxFee.toNumber()),
    })];
}


export function wrapLegacyTx(txInxs: TransactionInstruction[], payerKeypair: Keypair, blockhash: any, lookupTable?: any): MessageV0 {
    return new TransactionMessage({
        payerKey: payerKeypair.publicKey,
        recentBlockhash: blockhash,
        instructions: txInxs
    }).compileToV0Message(lookupTable);
}

export async function optimizedSendAndConfirmTransaction(
    tx: VersionedTransaction,
    connection: Connection,
    blockhash: any,
    txRetryInterval: number
): Promise<string | null> {
    console.log(`optimizedSendAndConfirmTransaction...`);

    let txSignature;
    let confirmTransactionPromise = null;
    let confirmedTx = null;

    try {
        // Simulating the transaction
        const simulationResult = await connection.simulateTransaction(tx, { commitment: "processed", });
        if (simulationResult.value.err) await catchSimulationErrors(simulationResult);

        const signatureRaw: any = tx.signatures[0];
        txSignature = bs58.encode(signatureRaw);

        let txSendAttempts = 1;

        console.log(`${new Date().toISOString()} Subscribing to transaction confirmation`);
        let blockhash = await connection.getLatestBlockhash();

        // confirmTransaction throws error, handle it
        confirmTransactionPromise = connection.confirmTransaction({
            signature: txSignature,
            blockhash: blockhash.blockhash,
            lastValidBlockHeight: blockhash.lastValidBlockHeight,
        }, "confirmed");

        console.log(`${new Date().toISOString()} Sending Transaction ${txSignature}`);

        // send before starting retry while loop
        await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 0, });
        confirmedTx = null;
        const txId = txSignature.substring(0, 6);

        // retry while loop
        while (!confirmedTx) {
            confirmedTx = await Promise.race([
                confirmTransactionPromise,
                new Promise((resolve) =>
                    setTimeout(() => {
                        resolve(null);
                    }, 50)
                ),
            ]);

            console.log("confirmedTx:", confirmedTx);

            // confirmed => break loop
            if (confirmedTx) { console.log(`Tx ${txId} confirmed ,${txRetryInterval * txSendAttempts}`, confirmedTx); break; }
            // retry
            console.log(`Resending tx id ${txId} ${txRetryInterval * txSendAttempts++}ms`);
            await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 0 });

        } // end loop

    } catch (error:any) {
        console.error(`${new Date().toISOString()} Error: ${error.message}`);
        throw new Error(`Transaction failed: ${error.message}`)
    }

    if (!confirmedTx) {
        console.log(`${new Date().toISOString()} Transaction failed`);
        throw new Error(`Transaction not confirmed,busy network, try again.`)
    }
    // loop ends, no error, transaction confirmed return link
    console.log(`${new Date().toISOString()} Transaction successful`);
    console.log(`${new Date().toISOString()} Explorer URL: https://solscan.io/tx/${txSignature}`);

    return txSignature;
}

export async function catchSimulationErrors(simulationResult: any) {
    const SLIPPAGE_ERROR = /Error: exceeds desired slippage limit/;
    const SLIPPAGE_ERROR_ANCHOR = /SlippageToleranceExceeded/;
    if (simulationResult.value.logs.find((logMsg: any) => SLIPPAGE_ERROR.test(logMsg)) ||
        simulationResult.value.logs.find((logMsg: any) => SLIPPAGE_ERROR_ANCHOR.test(logMsg))) {
        throw new Error(`🔴 Slippage error, try increasing your slippage %.`);
    }
    const BALANCE_ERROR = /Transfer: insufficient lamports/;
    if (simulationResult.value.logs.find((logMsg: any) => BALANCE_ERROR.test(logMsg))) {
        throw new Error(`🔴 Insufficient balance for transaction.`);
    }
    const FEES_ERROR = 'InsufficientFundsForFee';
    if (simulationResult.value.err === FEES_ERROR) {
        throw new Error(`🔴 Swap failed! Please try again.`);
    }
}

export async function updatePositions(
    chatId: string,
    userWallet: Keypair,
    tradeSide: string,
    tradeType: string,
    tokenIn: string,
    tokenOut: string,
    tokenName: string,
    tokenSymbol: string,
    amountIn: number, // in lamports
    extractAmount: number,
) {

    let newUserPosition: any;
    const userPosition = await UserPositions.findOne({ positionChatId: chatId, walletId: userWallet.publicKey.toString() });

    let oldPositionSol: number = 0;
    let oldPositionToken: number = 0;
    if (userPosition) {
        const existingPositionIndex = userPosition.positions.findIndex(
            (position: any) => position.baseMint === (tradeSide == 'buy' ? tokenOut.toString() : tokenIn.toString())
        );
        if (userPosition.positions[existingPositionIndex]) {
            oldPositionSol = userPosition.positions[existingPositionIndex].amountIn
            oldPositionToken = userPosition.positions[existingPositionIndex].amountOut!
        }
    }

    if (tradeSide == 'buy') {
        newUserPosition = {
            baseMint: tokenOut,
            name: tokenName,
            symbol: tokenSymbol,
            tradeType: tradeType,
            amountIn: oldPositionSol ? oldPositionSol + amountIn: amountIn,
            amountOut: oldPositionToken ? oldPositionToken + extractAmount : extractAmount
        }
    } else if (tradeSide == 'sell'){

        let newAmountIn, newAmountOut;
        if (Number(amountIn) === oldPositionToken || oldPositionSol <= extractAmount) {

            newAmountIn = 0;
            newAmountOut = 0;
        } else {
            newAmountIn = oldPositionSol > 0 ? oldPositionSol - extractAmount : oldPositionSol;
            newAmountOut = oldPositionToken > 0 ? oldPositionToken - Number(amountIn) : oldPositionToken;
        }

        if (newAmountIn <= 0 || newAmountOut <= 0) {
            console.log("updating existing position");
            await UserPositions.updateOne({ walletId: userWallet.publicKey.toString() }, { $pull: { positions: { baseMint: tokenIn } } });
        } else {
            console.log("save new position", newUserPosition);
            newUserPosition = {
                baseMint: tokenIn,
                name: tokenName,
                symbol: tokenSymbol,
                tradeType: tradeType,
                amountIn: newAmountIn,
                amountOut: newAmountOut,
            }
        }
    }
    newUserPosition && await saveUserPosition(chatId, new PublicKey(userWallet.publicKey).toBase58(), newUserPosition);
}

export async function updateReferralBalance(chatId: string,amountUse:BigNumber,referralCommision: number) {
    const referralFee = referralCommision / 100;
    const bot_fee = new BigNumber(amountUse.multipliedBy(MVXBOT_FEES));
    const referralAmmount = (bot_fee.multipliedBy(referralFee));
    const refferalFeePay = new BigNumber(referralAmmount).multipliedBy(1e9);
    const referralRecord = await Referrals.findOne({ referredUsers:chatId });
    let actualEarnings = referralRecord && referralRecord.earnings;

    if (referralRecord) {
      let updateEarnings = actualEarnings && actualEarnings + (refferalFeePay).toNumber();
      referralRecord.earnings = Number(updateEarnings && updateEarnings.toFixed(0));
      referralRecord.save();
    }
}

export function getTargetDate(msg: any): Date | null {
    try {  // Split the message into its components
        const [mins, hrs, days] = msg.split(':').map(Number);

        // Get the current date
        const date = new Date(Date.now());

        // Add the time to the date
        date.setMinutes(date.getMinutes() + mins);
        date.setHours(date.getHours() + hrs);
        date.setDate(date.getDate() + days);

        // Return the new date
        console.log('expiry date: ', date.toLocaleString());
        
        return date;
    } catch (error: any) {
        console.error('Error getting target date:', error.message);
        return null;
    }
}