
// import {SearcherClient} from 'jito-ts/dist/sdk/block-engine/searcher.js';
import { _loopRPCpromise } from '../util';
import dotenv from 'dotenv'; dotenv.config();
import path from 'path';
import { Keypair, PublicKey, SystemProgram, VersionedTransaction, TransactionMessage, Connection } from '@solana/web3.js';
import bs58 from 'bs58';
import { Transaction } from '@solana/web3.js';
import { TransactionInstruction } from '@solana/web3.js';

/*
    Mainnet: https://mainnet.block-engine.jito.wtf
    Amsterdam: https://amsterdam.mainnet.block-engine.jito.wtf
    Frankfurt: https://frankfurt.mainnet.block-engine.jito.wtf
    New York: https://ny.mainnet.block-engine.jito.wtf
    Tokyo: https://tokyo.mainnet.block-engine.jito.wtf
*/

const TIP_ACCOUNTS = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT"].map((pubkey) => new PublicKey(pubkey));

export const getRandomTipAccount = () => TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)];

async function getBundleStatus(bundleId: string): Promise<any> {
    let endpoint = `https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles`;

    let payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "getInflightBundleStatuses",
        params: [[bundleId]]
    };
    let res = await fetch(endpoint, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' }});
    let json = await res.json();
    if (json.error) {
        throw new Error(json.error.message);
    }

    return json.result;
}

async function confirmBundleStatus(bundleId: string): Promise<any> {
    return new Promise(async (resolve) => {
        const bundleStatus = await getBundleStatus(bundleId);
        console.log("bundleStatus::: ", bundleId, bundleStatus);
        if (bundleStatus.value.length > 0 && bundleStatus.value[0].status == "Landed") {
            resolve(bundleStatus);
        }
    });
}

export async function sendJitoBundleRPC(
    cnx: Connection,
    payerKeypair: Keypair,
    tip: string,
    tx: Transaction | VersionedTransaction
): Promise<string> {

    let endpoint = 'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles';
    let txSig = '';
    const vTxWithTip: TransactionInstruction = await jitoTippingInx(cnx, payerKeypair, tip);
    const blockhash = (await cnx.getLatestBlockhash());
    let swapTxResult = '';
    
    if (tx instanceof Transaction) {
        tx.add(vTxWithTip);
        tx.recentBlockhash = blockhash.blockhash;
        tx.sign(payerKeypair);
        const signatureRaw = tx.signatures[0].signature;
        swapTxResult = bs58.encode(new Uint8Array(signatureRaw!));
        txSig = bs58.encode(new Uint8Array(tx.serialize()));
    } else if (tx instanceof VersionedTransaction) {
        txSig = bs58.encode(new Uint8Array(tx.serialize()));
        const signatureRaw: any = tx.signatures[0];
        swapTxResult = bs58.encode(signatureRaw);
    }
    
    console.log("swapTxResult::: ", swapTxResult);

    let payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [[txSig], { "commitment": "finalized" }]
    };

    let res = await fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
            'Content-Type': 'application/json'
            // Use auth only when hitting rate limit
            // 'x-jito-auth': `Bearer ${process.env.JITO_ACCESS_TOKEN}`
        }
    });

    let json = await res.json();
    if (json.error) {
        throw new Error(json.error.message);
    }

    // -- Print bundle ID
    console.info("Bundle ID:", `https://explorer.jito.wtf/bundle/${json.result}`);

    let bundleStatus = await getBundleStatus(json.result);
    while (bundleStatus.value[0].status != "Landed") {
        bundleStatus = await getBundleStatus(json.result);
        console.log("bundleStatus::: ", bundleStatus.value[0].status);
    }

    return swapTxResult;
}

export async function jitoTippingInx(cnx: Connection, payerKeypair: Keypair, tip: string): Promise<TransactionInstruction> {
    return SystemProgram.transfer({
        fromPubkey: payerKeypair.publicKey,
        toPubkey: new PublicKey(getRandomTipAccount()),
        lamports: BigInt(tip),
    });
}


// const decodedKey = new Uint8Array(
//     JSON.parse(fs.readFileSync(AUTH_KEYPAIR_PATH).toString()) as number[],
// );
// const keypair = Keypair.fromSecretKey(decodedKey);

// const searcherClients: SearcherClient[] = [];
// console.log("keypair sign bundle",keypair.publicKey.toBase58());

// for (const url of BLOCK_ENGINE_URLS) { only NY now
// const client = searcherClient(
//     BLOCK_ENGINE_URLS, keypair, {
//     'grpc.keepalive_timeout_ms': 4000,
// });
// searcherClients.push(client);
// }

// const geyserClient = jitoGeyserClient(GEYSER_URL, GEYSER_ACCESS_TOKEN, {
//     'grpc.keepalive_timeout_ms': 4000,
// });

// all bundles sent get automatically forwarded to the other regions.
// assuming the first block engine in the array is the closest one
// const searcherClient = searcherClients[0];+

// export { searcherClient, getRandomTipAccount } //, searcherClients, geyserClient };

/**
 * ./target/release/jito-searcher-cli \
  --block-engine-url https://ny.mainnet.block-engine.jito.wtf \
  --keypair-path auth/jito.json \
  send-bundle \
  --payer auth/admin.json \
  --message "im testing jito bundles right now this is pretty sick bro" \
  --num-txs 1 \
  --lamports 100000 \
  --tip-account 96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5 \
  --rpc-url "https://cool-smart-frost.solana-mainnet.quiknode.pro/defadc0e68cee5ab416015a5b597060608152c59/?access-token=GYFZ2tt6ZEEfuoYeDWbNudwiCacLAcZDUTsd4xRZ648a"

 */