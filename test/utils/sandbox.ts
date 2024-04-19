

import { Keypair, PublicKey, Connection } from "@solana/web3.js";
const TX = "3mmWmXyLrgxNM5YNNENJ8PFQs9VG1XfhKv68kRf71RpRroA3gagJNF8gsmo1XArBA8F1R6cMvYFZ5tPTWsu2gXhV";


async function test() {
    const connection = new Connection('https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41');
    const txxs = await connection.getParsedTransaction(TX, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
    let txAmount: Array<any> | undefined;
    console.log("tx:: ", txxs);

    // if (txxs && txxs.meta && txxs.meta.innerInstructions && txxs.meta.innerInstructions) {
    //     txxs.meta.innerInstructions.forEach((tx) => {
    //         console.log("tx:: ", tx);

    //             txAmount = JSON.parse(JSON.stringify(tx.instructions));
    //             txAmount = !Array.isArray(txAmount) ? [txAmount] : txAmount;
    //             txAmount.forEach((tx) => {
    //                 // if (tx.parsed.info.authority == RAYDIUM_AUTHORITY) { extractAmount = tx.parsed.info.amount; }
    //                 console.log('inner tx: ', JSON.parse(JSON.stringify(tx)));
    //             });

    //     });
    // }
}

test();