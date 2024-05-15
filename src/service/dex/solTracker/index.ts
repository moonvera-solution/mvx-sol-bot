import axios from 'axios';
import dotenv from "dotenv"; dotenv.config();
import bs58 from 'bs58';
import SolanaTracker from "./solTrackerUtils";
import { sendTx, add_mvx_and_ref_inx_fees, addMvxFeesInx, wrapLegacyTx } from '../../../../src/service/util';
import { Keypair, Connection, Transaction, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import BigNumber from 'bignumber.js';

/**
 * @notice Quotes from solTracker API then sends swap tx adding mvx&ref fees
 * @param passing connection b4 SOL_TRACKER_SWAP_PARAMS 
 * @returns Arrays of tx ids, false if fails
 */
export async function swap_solTracker(connection: Connection ,{
    side,
    from,
    to,
    amount,
    slippage,
    payerKeypair,
    referralWallet,
    referralCommision,
    priorityFee,
    forceLegacy,
}: SOL_TRACKER_SWAP_PARAMS ) : Promise<string[] | false> {
    
    const params = new URLSearchParams({
        from, to, fromAmount: amount.toString(),
        slippage: slippage.toString(),
        payer: payerKeypair.publicKey.toBase58(),
        priorityFee:  '0.001',
        forceLegacy: forceLegacy ? "true" : "false",
    });
    console.log('priorityFee:', priorityFee)
    // if (priorityFee) params.append("priorityFee", '0.005');
    const headers = { 'x-api-key': process.env.SOL_TRACKER_API_KEY! };
    const blockhash = (await connection.getLatestBlockhash()).blockhash;

    // API CALL TO SOL TRACKER SWAP
    return axios.get(`${process.env.SOL_TRACKER_API_URL}/swap`, { params, headers }).then(async(swapInx) => {
        const swapResponse = swapInx.data;
        const serializedTransactionBuffer = Buffer.from(swapResponse.txn, "base64");
        let solAmount: BigNumber = side == 'buy' ? new BigNumber(swapResponse.rate.amountIn) : new BigNumber(swapResponse.rate.amountOut);
        let hasReferral = referralWallet && referralCommision;
        const versionnedBundle: VersionedTransaction[] = [];
        const txInxs = hasReferral ?
            add_mvx_and_ref_inx_fees(payerKeypair, referralWallet!, solAmount, referralCommision!) :
            addMvxFeesInx(payerKeypair, solAmount);
        if (swapResponse.isJupiter && !swapResponse.forceLegacy) {
            const txn = VersionedTransaction.deserialize(serializedTransactionBuffer); if (!txn) return false;
            versionnedBundle.push(new VersionedTransaction(wrapLegacyTx(txInxs, payerKeypair,blockhash)));
            versionnedBundle.push(txn);
            return  await sendTx(connection, payerKeypair, versionnedBundle, { preflightCommitment: 'processed' });
        } else {
            const txn = Transaction.from(serializedTransactionBuffer); if (!txn) return false;
            const tx = new Transaction().add(txn); // add swap inx 
            txInxs.forEach((inx:any) => tx.add(inx));  // add mvx, ref inx
            // let recentBlockhash = await connection.getLatestBlockhash('processed');
            // console.log('txInxs:', txn);
            // console.log('tx:', tx.signatures[0]);
            const transx = await sendTx(connection, payerKeypair, [tx], { preflightCommitment: 'processed' });
            console.log('transx:', transx);
            return transx
        }
    }).catch(error => { console.error('swap_solTracker:', error); return false;});
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
        const response = await axios.get(`${process.env.SOL_TRACKER_API_URL}/rate?`, { params, headers });
        console.log("rate response:", response.data);
        return response.data.currentPrice;
    } catch (error: any) {
        throw new Error(error);
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
        'https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41',
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
export type SOL_TRACKER_SWAP_PARAMS =     {
    side: 'buy' | 'sell',
    from: string,
    to: string,
    amount: string,
    slippage: string,
    payerKeypair: Keypair,
    referralWallet?: string | null,
    referralCommision?: number | null,
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
