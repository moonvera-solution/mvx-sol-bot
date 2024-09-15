import axios from 'axios';
import dotenv from "dotenv"; dotenv.config();
import SolanaTracker from "./solTrackerUtils";
import { sendTx, add_mvx_and_ref_inx_fees, addMvxFeesInx, wrapLegacyTx, optimizedSendAndConfirmTransaction } from '../../../../src/service/util';
import { Keypair, Connection, Transaction, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import { sendJitoBundleRPC } from "../../jito";

const TX_RETRY_INTERVAL = 50;

/**
 * @notice Quotes from solTracker API then sends swap tx adding mvx&ref fees
 * @param passing connection b4 SOL_TRACKER_SWAP_PARAMS 
 * @returns Arrays of tx ids, false if fails
 */
export async function pump_fun_swap(cnx: Connection, {
    side,
    from,
    to,
    amount,
    slippage,
    payerKeypair,
    referralWallet,
    referralCommision,
    priorityFee,
    jitoObject: { useJito, jitoTip },
    forceLegacy,
}: SOL_TRACKER_SWAP_PARAMS): Promise<string | null> {
    const params = new URLSearchParams({
        from, to, fromAmount: amount.toString(),
        slippage: slippage.toString(),
        payer: payerKeypair.publicKey.toBase58(),
        priorityFee: Number.parseFloat(String(priorityFee)).toString(),
        forceLegacy: forceLegacy ? "true" : "false",
    });

    const headers = { 'x-api-key': process.env.SOL_TRACKER_API_KEY! };
    const blockhash = await cnx.getLatestBlockhash();

    // console.log(" ${process.env.SOL_TRACKER_API_URL}/swap:: ",`${process.env.SOL_TRACKER_API_URL}/swap`);
    const swapInx = await fetch(`${process.env.SOL_TRACKER_API_URL}/swap?${params.toString()}`, { headers }).then((response) => response.json());
    console.log("== SWAP INX ==", swapInx);
    if (!swapInx) return null;
    const swapResponse = swapInx;
    const serializedTransactionBuffer = Buffer.from(swapResponse.txn, "base64");
    let solAmount: BigNumber = side == 'buy' ? new BigNumber(swapResponse.rate.amountIn) : new BigNumber(swapResponse.rate.amountOut);
    let hasReferral = referralWallet && referralCommision! > 0;

    const mvxInxs = addMvxFeesInx(payerKeypair, solAmount.multipliedBy(1e9));
    // add_mvx_and_ref_inx_fees(payerKeypair, referralWallet!, solAmount.multipliedBy(1e9), referralCommision!):

    let txSig = null;
    if (swapResponse.isJupiter && !swapResponse.forceLegacy) {
        
        const vTxx = VersionedTransaction.deserialize(new Uint8Array(serializedTransactionBuffer)); if (!vTxx) return null;
        const message : TransactionMessage = TransactionMessage.decompile(vTxx.message);
        const pumpInx: Transaction = new Transaction({ blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight }).add(...message.instructions);
        pumpInx.sign(payerKeypair);

        txSig = useJito ?
            await sendJitoBundleRPC(cnx, payerKeypair, jitoTip, pumpInx) :
            await optimizedSendAndConfirmTransaction(
                new VersionedTransaction(wrapLegacyTx(pumpInx.instructions, payerKeypair, blockhash.blockhash)),
                cnx, blockhash, TX_RETRY_INTERVAL
            );

    } else {

        let pumpInx: Transaction = Transaction.from(serializedTransactionBuffer); if (!pumpInx) return null;
        if (useJito) {
            console.log("sending jito bunddle....");
            pumpInx.instructions.push(...mvxInxs);
            txSig = await sendJitoBundleRPC(cnx, payerKeypair, jitoTip, pumpInx)
        } else {
            pumpInx.instructions.push(...mvxInxs);
            const vtxx = new VersionedTransaction(wrapLegacyTx(pumpInx.instructions, payerKeypair, blockhash.blockhash));
            vtxx.sign([payerKeypair]);
            txSig = await optimizedSendAndConfirmTransaction(vtxx,cnx, blockhash, TX_RETRY_INTERVAL);
        }
    }
    return txSig;
}

export async function getSwapDetails(
    from: String,
    to: String,
    amount: Number,
    slippage: Number,
) {
    const params = { from, to, amount, slippage };
    const headers = { 'x-api-key': process.env.SOL_TRACKER_API_KEY! };
    try {
        const response = await fetch(`${process.env.SOL_TRACKER_API_URL}/rate?from=${params.from}&to=${params.to}&amount=1&slippage=${params.slippage}`, { headers }).then((response) => response.json());
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
    referralWallet?: string | null,
    referralCommision?: number | null,
    priorityFee?: number | null,
    forceLegacy?: boolean,
    jitoObject: { useJito: boolean, jitoTip: string },
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
