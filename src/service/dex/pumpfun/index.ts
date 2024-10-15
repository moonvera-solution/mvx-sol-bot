import dotenv from "dotenv"; dotenv.config();
import SolanaTracker from "./solTrackerUtils";
import {  addMvxFeesInx, wrapLegacyTx, optimizedSendAndConfirmTransaction } from '../../../../src/service/util';
import { Keypair, Connection, Transaction, AddressLookupTableAccount, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import { ComputeBudgetProgram } from '@solana/web3.js';
const TX_RETRY_INTERVAL = 25;

/**
 * @notice Quotes from solTracker API then sends swap tx adding mvx&ref fees
 * @param passing connection b4 SOL_TRACKER_SWAP_PARAMS 
 * @returns Arrays of tx ids, false if fails
 */
export async function soltracker_swap(ctx: any,connection: Connection, {
    side,
    from,
    to,
    amount,
    slippage,
    payerKeypair,
    priorityFee,
    forceLegacy,
}: SOL_TRACKER_SWAP_PARAMS): Promise<string | null> {
    try{
    console.log('slippage', slippage);
    const params = new URLSearchParams({
        from, to, fromAmount: amount.toString(),
        slippage: slippage.toString(),
        payer: payerKeypair.publicKey.toBase58(),
        priorityFee: Number.parseFloat(String(priorityFee)).toString(),
        forceLegacy: forceLegacy ? "true" : "false",
    });
    
    const headers = { 'x-api-key': process.env.SOL_TRACKER_API_KEY! };
    const blockhash = await connection.getLatestBlockhash();
    // console.log(" ${process.env.SOL_TRACKER_API_URL}/swap:: ",`${process.env.SOL_TRACKER_API_URL}/swap`);
    const swapInx = await fetch(`${process.env.SOL_TRACKER_API_URL}/swap?${params.toString()}`, { headers }).then((response) => response.json());
    console.log("== SWAP INX ==", swapInx);
    if(swapInx.error) {
        ctx.api.sendMessage(ctx.session.chatId, `❌ Transaction failed!`);
        return null;
    }
    if (!swapInx) return null;
    let swapResponse = swapInx;
    swapResponse.rate.fee = 0;
    swapResponse.rate.platformFee = 0;
    swapResponse.rate.platformFeeUI = 0;
    console.log("== SWAP RESPONSE ==", swapResponse);
    const serializedTransactionBuffer = Buffer.from(swapResponse.txn, "base64");
    let solAmount: BigNumber = side == 'buy' ? new BigNumber(swapResponse.rate.amountIn) : new BigNumber(swapResponse.rate.amountOut);
    const mvxInxs = addMvxFeesInx(payerKeypair, solAmount.multipliedBy(1e9));
        
    let txSig = null;
    if (swapResponse.isJupiter && !swapResponse.forceLegacy) {
        const transaction = VersionedTransaction.deserialize(serializedTransactionBuffer as any); if (!transaction) return null;
        
        const addressLookupTableAccounts = await Promise.all(
            transaction.message.addressTableLookups.map(async (lookup) => {
                return new AddressLookupTableAccount({
                    key: lookup.accountKey,
                    state: AddressLookupTableAccount.deserialize(await connection.getAccountInfo(lookup.accountKey).then((res) => res!.data) as any),
                })
            }));
        var message = TransactionMessage.decompile(transaction.message, { addressLookupTableAccounts: addressLookupTableAccounts })
        message.instructions.push(...mvxInxs);
        message.instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 150000 }));
        transaction.message = message.compileToV0Message(addressLookupTableAccounts);
        transaction.sign([payerKeypair]);
        
        txSig =  await optimizedSendAndConfirmTransaction(
            new VersionedTransaction(transaction.message),
            connection, blockhash, TX_RETRY_INTERVAL
        );
        console.log("== JUP TX ==", txSig);
        return txSig;

    } else {
        console.log('pump going in here')
        let txx: Transaction = new Transaction({blockhash: blockhash.blockhash,lastValidBlockHeight:blockhash.lastValidBlockHeight});
        let pumpInx = Transaction.from(serializedTransactionBuffer); if (!pumpInx) return null;
        txx.add(pumpInx); // add pump inx
        // txx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 150000 }));
        mvxInxs.forEach((inx: any) => txx.add(inx)); 
         // add mvx, ref inx
        const vTxx = new VersionedTransaction(wrapLegacyTx(txx.instructions, payerKeypair, blockhash.blockhash));

        const addressLookupTableAccounts = await Promise.all(
            vTxx.message.addressTableLookups.map(async (lookup) => {
                return new AddressLookupTableAccount({
                    key: lookup.accountKey,
                    state: AddressLookupTableAccount.deserialize(await connection.getAccountInfo(lookup.accountKey).then((res) => res!.data) as any),
                })
            }));

        var message = TransactionMessage.decompile(vTxx.message, { addressLookupTableAccounts: addressLookupTableAccounts })
        vTxx.message = message.compileToV0Message(addressLookupTableAccounts);
   
        vTxx.sign([payerKeypair]);
        txSig = await optimizedSendAndConfirmTransaction(vTxx,connection, blockhash, TX_RETRY_INTERVAL);
        console.log("== LEGACY TX ==", txSig);
    }
    return txSig;
} catch (e: any) {
    console.log(e);
    ctx.api.sendMessage(ctx.session.chatId, `❌ Transaction failed!`);
    return null;
}
}

// export async function getSwapDetails(
//     from: String,
//     to: String,
//     amount: Number,
//     slippage: Number,
// ) {
//     const params = { from, to, amount, slippage };
//     const headers = { 'x-api-key': process.env.SOL_TRACKER_API_KEY! };
//     try {
//         const response = await axios.get(`${process.env.SOL_TRACKER_API_URL}/rate?`, { params, headers });
//         console.log("rate response:", response.data);
//         return response.data.currentPrice;
//     } catch (error: any) {
//         throw new Error(error);
//     }
// }
export async function getSwapDetails(
    from: String,
    to: String,
    amount: Number,
    slippage: Number,
) {
    const params = { from, to, amount, slippage };
    const headers = { 'x-api-key': process.env.SOL_TRACKER_API_KEY! };
    try {
        const response = await fetch(`${process.env.SOL_TRACKER_API_URL}/rate?from=${params.from}&to=${params.to}&amount=1&slippage=${params.slippage}`, {  headers }).then((response) => response.json());
        return response.currentPrice;
    } catch (error: any) {
       console.error(error);
        throw new Error('Pumpfun swap failed');
    }
}


/**
 * DONOT USE THIS FUNCTION AS IT IS
 */
async function swap_solTracker_sdk(
    from: string,
    to: string,
    amount: number,
    slippage: number,
    payerKeypair: Keypair,
    priorityFee?: number,
    forceLegacy?: boolean
) {
    const headers = { 'x-api-key': '13460529-40af-40d4-8834-2a37f1701aa4' };
    const keypair = payerKeypair;
    const solanaTracker = new SolanaTracker(
        keypair,
        'https://moonvera.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41',
        'https://swap-api-xmb4.solanatracker.io',
        headers
    );

    const swapResponse = await solanaTracker.getSwapInstructions(
        from, // From Token
        to, // To Token
        amount, // Amount to swap
        slippage, // Slippage
        keypair.publicKey.toBase58(), // Payer public key
        priorityFee, // Priority fee (Recommended while network is congested)
        true // Force legacy transaction for Jupiter
    );

    const txid = await solanaTracker.performSwap(swapResponse, {
        sendOptions: { skipPreflight: true },
        confirmationRetries: 30,
        confirmationRetryTimeout: 1000,
        lastValidBlockHeightBuffer: 150,
        resendInterval: 1000,
        confirmationCheckInterval: 1000,
        skipConfirmationCheck: true, // Set to true if you want to skip confirmation checks and return txid immediately
    });
    // Returns txid when the swap is successful or throws an error if the swap fails
    console.log("Transaction ID:", txid);
    console.log("Transaction URL:", `https://explorer.solana.com/tx/${txid}`);
}
export type SOL_TRACKER_SWAP_PARAMS = {
    side: 'buy' | 'sell',
    from: string,
    to: string,
    amount: string,
    slippage: string,
    payerKeypair: Keypair,
    priorityFee?: number | null,
    forceLegacy?: boolean
}


// one unit of shitcoin for sol price time usdc
// getSwapDetails(
//     '75phDCFFYi4JP3X5HghGzjHzxsqiuEEhyyUY6FmmYRgo',
//     'So11111111111111111111111111111111111111112',
//     1,
//     0.5
// ).then((res) => console.log('res',res)).catch(console.error);

// const keypair = Keypair.fromSecretKey(bs58.decode('gzUcAh399QM7T5uCQfuiVxfeGDJp5mwEpfrQaTbrP8ZwqkAE8dTn3A4F5TP9hjDDn2txix6ebW2Ui8axNBqiPnX'));
// swap_solTracker(
//     'sell',
//     'So11111111111111111111111111111111111111112',
//     'AwqqdEHVp3UMfuUG8zP2AA1XvYxxF5SbdX3NpuQhY5Zn',
//     '0.0001',  // amount
//     '10', // slippage
//     keypair, // Keypair,
//     null, // referralWallet
//     null, // referralCommision
//     null, // priorityFee
//     true,// forceLegacy
// ).then((res) => console.log(res)).catch(console.error);