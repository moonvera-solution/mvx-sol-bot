import { geyserClient as jitoGeyserClient } from 'jito-ts';
import { Bundle as JitoBundle } from 'jito-ts/dist/sdk/block-engine/types.js';
import {
    SearcherClient,
    searcherClient as jitoSearcherClient,
} from 'jito-ts/dist/sdk/block-engine/searcher.js';
import * as fs from 'fs';
import path from 'path';
import {
    AccountMeta,
    Keypair,
    PublicKey,
    SystemProgram,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
} from '@solana/web3.js';

const TIP_ACCOUNTS = [
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5"].map((pubkey) => new PublicKey(pubkey));

const getRandomTipAccount = () => TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)];

const BLOCK_ENGINE_URLS = "ny.mainnet.block-engine.jito.wtf" //"frankfurt.mainnet.block-engine.jito.wtf"//  "https://ny.mainnet.block-engine.jito.wtf"; //config.get('block_engine_urls');
const AUTH_KEYPAIR_PATH = path.join(process.cwd(), '.local/jito.json') //config.get('auth_keypair_path');

const GEYSER_URL = "no access yet"//config.get('geyser_url');
const GEYSER_ACCESS_TOKEN = "no access yet"// config.get('geyser_access_token');

// const decodedKey = new Uint8Array(
//     JSON.parse(fs.readFileSync(AUTH_KEYPAIR_PATH).toString()) as number[],
// );
// const keypair = Keypair.fromSecretKey(decodedKey);

const searcherClients: SearcherClient[] = [];
// console.log("keypair sign bundle",keypair.publicKey.toBase58());

// for (const url of BLOCK_ENGINE_URLS) { only NY now
    // const client = jitoSearcherClient(
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
const searcherClient = searcherClients[0];

export async function sendJitoBundleFromIx(callerKey:String, vTxs: VersionedTransaction[]) {

    searcherClient.sendBundle(
        new JitoBundle(vTxs, vTxs.length)
    ).then((bundleId: any) => {
        console.info(`Bundle ${bundleId} sent`);
    }).catch((error: any) => {
        console.error("sendBundle ERROR", error.message);
        throw error;
    });
    searcherClient.onBundleResult(async (bundleResult: any) => {
        const bundleId = bundleResult.bundleId;
        const isAccepted = bundleResult.accepted;
        const isRejected = bundleResult.rejected;

        if (isAccepted) {
            console.info(
                `Bundle ${bundleId} accepted in slot ${bundleResult.accepted && bundleResult.accepted.slot}`,
            );
            console.info("bundleResult.accepted", isAccepted)
            return;
        }
    }, (error: any) => {
        console.error(error.message);
        throw error;
    },
    );

}
export { searcherClient, getRandomTipAccount } //, searcherClients, geyserClient };

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

  /**
   * 
// TRADING
// export async function handle_radyum_trade_MEV(chatId: any, inputToken: String, side: String, amount: any) {
    //  chatStates[chatId].activeWalletIndex = await _getWallet(chatId);
//     if (await _getWallet(chatId) == null) {
//         await bot.api.sendMessage(chatId, "You already have a wallet. Use /balance to check your balance or /privatekey to get your private key.");
//         return;
//     } else {
//         const userWallet = loadKeypairFromFile('local_keys/keys.json', chatId);
//         const inputToken = side == 'buy' ? DEFAULT_TOKEN.WSOL : DEFAULT_TOKEN.SOLFI;
//         const outputToken = side == 'buy' ? DEFAULT_TOKEN.SOLFI : DEFAULT_TOKEN.WSOL;

//         const targetPool = DEFAULT_TOKEN.SOLFI_SOL_V4_POOL; //SOLFI-SOL 
//         const inputTokenAmount = new TokenAmount(inputToken, amount);
//         const slippage = new Percent(1, 100);
//         const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey);
//         const tradeSigner: Keypair[] = [wallet];

//         // Swap instruction
//         const swapTx = await getSwapOnlyAmmInstruction({
//             outputToken,
//             targetPool,
//             inputTokenAmount,
//             slippage,
//             walletTokenAccounts,
//             wallet: wallet,
//         });

//         let blockhash = await connection.getLatestBlockhash().then(res => res.blockhash);

//         const messageSetUp = new TransactionMessage({
//             payerKey: wallet.publicKey,
//             recentBlockhash: blockhash,
//             instructions: swapTx[0].instructions,
//         }).compileToV0Message();

//         // Init bundle
//         const versionnedBundle: VersionedTransaction[] = [];

//         const versionedTx = new VersionedTransaction(messageSetUp);
//         versionedTx.sign(tradeSigner);
//         versionnedBundle.push(versionedTx);

//         // TIP
//         const tipIxn = SystemProgram.transfer({
//             fromPubkey: wallet.publicKey,
//             toPubkey: getRandomTipAccount(),
//             lamports: BigInt("1000"),
//         });

//         const tipTxs: TransactionInstruction[] = [tipIxn];

//         const tipIxnSetUp = new TransactionMessage({
//             payerKey: wallet.publicKey,
//             recentBlockhash: blockhash,
//             instructions: tipTxs,
//         }).compileToV0Message();

//         const versionedTipTx = new VersionedTransaction(tipIxnSetUp);
//         versionedTipTx.sign(tradeSigner);

//         versionnedBundle.push(versionedTipTx);
//         searcherClient.sendBundle(new JitoBundle(versionnedBundle, 5)).then((bundleId: any) => {
//             console.info(`Bundle ${bundleId} sent`);
//         }).catch((error: any) => {
//             console.error("sendBundle ERROR", error.message);
//             throw error;
//         });
//         searcherClient.onBundleResult(async (bundleResult: any) => {
//             const bundleId = bundleResult.bundleId;
//             const isAccepted = bundleResult.accepted;
//             const isRejected = bundleResult.rejected;

//             if (isAccepted) {
//                 console.info(
//                     `Bundle ${bundleId} accepted in slot ${bundleResult.accepted && bundleResult.accepted.slot}`,
//                 );
//                 console.info("bundleResult.accepted", isAccepted)
//                 await bot.api.sendMessage(chatId, `https://solscan.io/tx/${bs58.encode(versionedTx.signatures[0])}`);
//                 return;
//             }
//         }, (error: any) => {
//             console.error(error.message);
//             throw error;
//         },
//         );
//     }
// }
   */