// // https://station.jup.ag/docs/apis/swap-api
import dotenv from 'dotenv';
dotenv.config();
// import {
//   Connection,Keypair,
//   VersionedTransaction,
//   BlockhashWithExpiryBlockHeight,
//   VersionedTransactionResponse,
//   TransactionExpiredBlockheightExceededError
// } from '@solana/web3.js';
// import fetch from 'cross-fetch';
// import promiseRetry from "promise-retry";
// import { Wallet } from '@project-serum/anchor';
// // import { parseErrorForTransaction } from '@mercurial-finance/optimist';
// import bs58 from 'bs58';

// // It is recommended that you use your own RPC endpoint.
// // This RPC endpoint is only for demonstration purposes so that this example will run.
// const NODE_URL = 'https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41';
// const connection = new Connection(NODE_URL);
// export const wait = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

// /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
// /*                  Jupiter SimpleSwap                        */
// /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/

// // function nodeSwap() {
// //   import { createJupiterApiClient } from "../src/index";
// //   import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
// //   import { Wallet } from "@project-serum/anchor";
// //   import bs58 from "bs58";
// //   import { transactionSenderAndConfirmationWaiter } from "./utils/transactionSender";
// //   import { getSignature } from "./utils/getSignature";

// //   export async function main() {
// //     const jupiterQuoteApi = createJupiterApiClient();
// //     const wallet = new Wallet(
// //       Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY || ""))
// //     );
// //     console.log("Wallet:", wallet.publicKey.toBase58());

// //     // Make sure that you are using your own RPC endpoint.
// //     const connection = new Connection(
// //       "https://neat-hidden-sanctuary.solana-mainnet.discover.quiknode.pro/2af5315d336f9ae920028bbb90a73b724dc1bbed/"
// //     );

// //     // get quote
// //     const quote = await jupiterQuoteApi.quoteGet({
// //       inputMint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
// //       outputMint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
// //       amount: 35281,
// //       slippageBps: 50,
// //       onlyDirectRoutes: false,
// //       asLegacyTransaction: false,
// //     });

// //     if (!quote) {
// //       console.error("unable to quote");
// //       return;
// //     }

// //     // Get serialized transaction
// //     const swapResult = await jupiterQuoteApi.swapPost({
// //       swapRequest: {
// //         quoteResponse: quote,
// //         userPublicKey: wallet.publicKey.toBase58(),
// //         dynamicComputeUnitLimit: true,
// //         prioritizationFeeLamports: "auto",
// //         // prioritizationFeeLamports: {
// //         //   autoMultiplier: 2,
// //         // },
// //       },
// //     });

// //     console.dir(swapResult, { depth: null });

// //     // Serialize the transaction
// //     const swapTransactionBuf = Buffer.from(swapResult.swapTransaction, "base64");
// //     var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

// //     // Sign the transaction
// //     transaction.sign([wallet.payer]);
// //     const signature = getSignature(transaction);

// //     // We first simulate whether the transaction would be successful
// //     const { value: simulatedTransactionResponse } =
// //       await connection.simulateTransaction(transaction, {
// //         replaceRecentBlockhash: true,
// //         commitment: "processed",
// //       });
// //     const { err, logs } = simulatedTransactionResponse;

// //     if (err) {
// //       // Simulation error, we can check the logs for more details
// //       // If you are getting an invalid account error, make sure that you have the input mint account to actually swap from.
// //       console.error("Simulation Error:");
// //       console.error({ err, logs });
// //       return;
// //     }

// //     const serializedTransaction = Buffer.from(transaction.serialize());
// //     const blockhash = transaction.message.recentBlockhash;

// //     const transactionResponse = await transactionSenderAndConfirmationWaiter({
// //       connection,
// //       serializedTransaction,
// //       blockhashWithExpiryBlockHeight: {
// //         blockhash,
// //         lastValidBlockHeight: swapResult.lastValidBlockHeight,
// //       },
// //     });

// //     // If we are not getting a response back, the transaction has not confirmed.
// //     if (!transactionResponse) {
// //       console.error("Transaction not confirmed");
// //       return;
// //     }

// //     if (transactionResponse.meta?.err) {
// //       console.error(transactionResponse.meta?.err);
// //     }

// //     console.log(`https://solscan.io/tx/${signature}`);
// //   }
// // }

// /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
// /*                            SWAP                            */
// /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
import { Keypair, Connection, PublicKey, VersionedTransaction, TransactionSignature, TransactionMessage } from "@solana/web3.js";
import bs58 from 'bs58';
import {transactionSenderAndConfirmationWaiter} from '../utils/transactionSender';
const connection = new Connection(`${process.env.TRITON_RPC_URL!}${process.env.TRITON_RPC_TOKEN!}`);
const MVX_JUP_REFERRAL = "HH2UqSLMJZ9VP9jnneixYKe3oW8873S9MLUuMF3xvjLH";
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.TEST_WALLET_PK!));

async function jupiterSimpleSwap(
) {
  // Swapping SOL to USDC with input 0.1 SOL and 0.5% slippage
  const quoteResponse = await (
    // TRITON_RPC_URL=https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41/jupiter/
    // rrect: https://my-triton-endpoint/my-token/jupiter/quote?inputMint..
    await fetch('https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41/jupiter/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk&amount=10000&slippageBps=50&platformFeeBps=80')
  ).json();

//   const [feeAccount] = await PublicKey.findProgramAddressSync(
//     [
//       Buffer.from("referral_ata"),
//       new PublicKey('HH2UqSLMJZ9VP9jnneixYKe3oW8873S9MLUuMF3xvjLH').toBuffer(), // your referral account public key
//       new PublicKey('WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk').toBuffer(), // the token mint, output mint for ExactIn, input mint for ExactOut.
//     ],
//     new PublicKey("45ruCyfdRkWpRNGEqWzjCiXRHkZs8WXCLQ67Pnpye7Hp") // the Referral Program
//   );

//   console.log('feeAccount', feeAccount.toBase58());
  console.log('quoteResponse', quoteResponse);

  const { swapTransaction } = await (
    await fetch('https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41/jupiter/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // quoteResponse from /quote api
        quoteResponse,
        // user public key to be used for the swap
        userPublicKey: wallet.publicKey.toString(),
        // auto wrap and unwrap SOL. default is true
        wrapAndUnwrapSol: true,
        // feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in /quote API.
         feeAccount:"EsAaFBS5xCqdg3TkmwZTThS5NwKpqFs3jj1XBJyWSqwV",
      })
    })
  ).json();

    console.log('swapTransaction', swapTransaction);

  // 6. Deserialize and sign the transaction
  const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
  var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
  // console.log(transaction);

  // sign the transaction
  transaction.message.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  // We first simulate whether the transaction would be successful
//   const { value: simulatedTransactionResponse } =
//   const { err, logs } = simulatedTransactionResponse;

  // 7. Execute the transaction
//   const serializedTransaction = Buffer.from(transaction.serialize());
  transaction.sign([wallet]);


  const tx = await connection.sendRawTransaction(transaction.serialize(), {preflightCommitment: 'processed'});
  console.log(`https://solscan.io/tx/${tx}`);

}
jupiterSimpleSwap().then((tx) => console.log('Swap', tx));


// /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
// /*                      EXCLUDE AMM                           */
// /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
// /** 
//  * async function excludeAMM(txid: string) {
//   // TX ID from last step if the transaction failed.
//   const transaction = connection.getTransaction(txid, {
//     maxSupportedTransactionVersion: 0,
//     commitment: 'confirmed'
//   });

//   const programIdToLabelHash = await (await fetch('https://quote-api.jup.ag/v6/program-id-to-label')).json();
//   const { programIds } = parseErrorForTransaction(transaction);

//   let excludeDexes = new Set();
//   if (programIds) {
//     for (let programId of programIds) {
//       let foundLabel = programIdToLabelHash[programId];
//       if (foundLabel) {
//         excludeDexes.add(foundLabel);
//       }
//     }
//   }

//   // Request another quote with `excludeDexes`.
//   const { data } = await (
//     await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000&excludeDexes=${Array.from(excludeDexes).join(',')}&slippageBps=50`)
//   ).json();
// } 
// */
// /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
// /*           Instructions Instead of Transaction              */
// /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
// /**
// async function swapInstructions() {
//   const instructions = await (
//     await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json'
//       },
//       body: JSON.stringify({
//         // quoteResponse from /quote api
//         quoteResponse,
//         userPublicKey: swapUserKeypair.publicKey.toBase58(),
//       })
//     })
//   ).json();

//   if (instructions.error) {
//     throw new Error("Failed to get swap instructions: " + instructions.error);
//   }

//   const {
//     tokenLedgerInstruction, // If you are using `useTokenLedger = true`.
//     computeBudgetInstructions, // The necessary instructions to setup the compute budget.
//     setupInstructions, // Setup missing ATA for the users.
//     swapInstruction: swapInstructionPayload, // The actual swap instruction.
//     cleanupInstruction, // Unwrap the SOL if `wrapAndUnwrapSol = true`.
//     addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
//   } = instructions;

//   const deserializeInstruction = (instruction) => {
//     return new TransactionInstruction({
//       programId: new PublicKey(instruction.programId),
//       keys: instruction.accounts.map((key) => ({
//         pubkey: new PublicKey(key.pubkey),
//         isSigner: key.isSigner,
//         isWritable: key.isWritable,
//       })),
//       data: Buffer.from(instruction.data, "base64"),
//     });
//   };

//   const getAddressLookupTableAccounts = async (
//     keys: string[]
//   ): Promise<AddressLookupTableAccount[]> => {
//     const addressLookupTableAccountInfos =
//       await connection.getMultipleAccountsInfo(
//         keys.map((key) => new PublicKey(key))
//       );

//     return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
//       const addressLookupTableAddress = keys[index];
//       if (accountInfo) {
//         const addressLookupTableAccount = new AddressLookupTableAccount({
//           key: new PublicKey(addressLookupTableAddress),
//           state: AddressLookupTableAccount.deserialize(accountInfo.data),
//         });
//         acc.push(addressLookupTableAccount);
//       }

//       return acc;
//     }, new Array<AddressLookupTableAccount>());
//   };

//   const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

//   addressLookupTableAccounts.push(
//     ...(await getAddressLookupTableAccounts(addressLookupTableAddresses))
//   );

//   const blockhash = (await connection.getLatestBlockhash()).blockhash;
//   const messageV0 = new TransactionMessage({
//     payerKey: payerPublicKey,
//     recentBlockhash: blockhash,
//     instructions: [
//       // uncomment if needed: ...setupInstructions.map(deserializeInstruction),
//       deserializeInstruction(swapInstructionPayload),
//       // uncomment if needed: deserializeInstruction(cleanupInstruction),
//     ],
//   }).compileToV0Message(addressLookupTableAccounts);
//   const transaction = new VersionedTransaction(messageV0);
// }
//  */
// /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
// /*           Using Token Ledger Instruction                  */

// // * If 'auto' is used, Jupiter will automatically set a priority
// // * fee for the transaction, it will be capped at 5,000,000
// // * lamports / 0.005 SOL.
// // *
// /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
// /**
//  * 
//   const instructions = await (
//     await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json'
//       },
//       body: JSON.stringify({
//         // quoteResponse from /quote api
//         quoteResponse,
//         useTokenLedger: true,
//       })
//       ).json();

//   const {
//     tokenLedgerInstruction: tokenLedgerPayload, // If you are using `useTokenLedger = true`.
//     swapInstruction: swapInstructionPayload, // The actual swap instruction.
//     addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
//   } = instructions;

//   // A withdraw instruction that will increase the user input token account amount.
//   const withdrawInstruction = ...;

//   // Coupled with the tokenLedgerInstruction, the swap instruction will use the
//   // user increased amount of the input token account after the withdrawal as input amount.
//   const tokenLedgerInstruction = new TransactionInstruction({
//     programId: new PublicKey(tokenLedgerPayload.programId),
//     keys: tokenLedgerPayload.accounts.map((key) => ({
//       pubkey: new PublicKey(key.pubkey),
//       isSigner: key.isSigner,
//       isWritable: key.isWritable,
//     })),
//     data: Buffer.from(tokenLedgerPayload.data, "base64"),
//   });

//   const swapInstruction = new TransactionInstruction({
//     programId: new PublicKey(swapInstructionPayload.programId),
//     keys: swapInstructionPayload.accounts.map((key) => ({
//       pubkey: new PublicKey(key.pubkey),
//       isSigner: key.isSigner,
//       isWritable: key.isWritable,
//     })),
//     data: Buffer.from(swapInstructionPayload.data, "base64"),
//   });

//   const getAdressLookupTableAccounts = async (
//     keys: string[]
//   ): Promise<AddressLookupTableAccount[]> => {
//     const addressLookupTableAccountInfos =
//       await connection.getMultipleAccountsInfo(
//         keys.map((key) => new PublicKey(key))
//       );

//     return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
//       const addressLookupTableAddress = keys[index];
//       if (accountInfo) {
//         const addressLookupTableAccount = new AddressLookupTableAccount({
//           key: new PublicKey(addressLookupTableAddress),
//           state: AddressLookupTableAccount.deserialize(accountInfo.data),
//         });
//         acc.push(addressLookupTableAccount);
//       }

//       return acc;
//     }, new Array<AddressLookupTableAccount>());
//   };

//   const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

//   addressLookupTableAccounts.push(
//     ...(await getAdressLookupTableAccounts(addressLookupTableAddresses))
//   );

//   const messageV0 = new TransactionMessage({
//     payerKey: payerPublicKey,
//     recentBlockhash: blockhash,
//     instructions: [tokenLedgerInstruction, withdrawInstruction, swapInstruction],
//   }).compileToV0Message(addressLookupTableAccounts);
//   const transaction = new VersionedTransaction(messageV0);
// }
//  */


// // export async function transactionSenderAndConfirmationWaiter({
// //   connection,
// //   serializedTransaction,
// //   blockhashWithExpiryBlockHeight,
// // }: TransactionSenderAndConfirmationWaiterArgs): Promise<VersionedTransactionResponse | null> {
  
// //   const txid = await connection.sendRawTransaction(
// //     serializedTransaction,
// //     SEND_OPTIONS
// //   );

// //   const controller = new AbortController();
// //   const abortSignal = controller.signal;

// //   const abortableResender = async () => {
// //     while (true) {
// //       await wait(2_000);
// //       if (abortSignal.aborted) return;
// //       try {
// //         await connection.sendRawTransaction(
// //           serializedTransaction,
// //           SEND_OPTIONS
// //         );
// //       } catch (e) {
// //         console.warn(`Failed to resend transaction: ${e}`);
// //       }
// //     }
// //   };

// //   try {
// //     abortableResender();
// //     // const lastValidBlockHeight = blockhashWithExpiryBlockHeight.lastValidBlockHeight - 150;
// //     let blockheight = await connection.getBlockHeight().then(res => res);
// //     const lastValidBlockHeight = await connection.getLatestBlockhashAndContext().then(res => res.value.lastValidBlockHeight);
// //     const blockhash = await connection.getLatestBlockhash().then(res => res.blockhash);
            
// //     // this would throw TransactionExpiredBlockheightExceededError
// //     await Promise.race([
// //       connection.confirmTransaction(
// //         {
// //           ...blockhashWithExpiryBlockHeight,
// //           lastValidBlockHeight,
// //           signature: txid,
// //           abortSignal,
// //         },
// //         "confirmed"
// //       ),
// //       new Promise(async (resolve) => {
// //         // in case ws socket died
// //         while (!abortSignal.aborted) {
// //           await wait(2_000);
// //           const tx = await connection.getSignatureStatus(txid, {
// //             searchTransactionHistory: false,
// //           });
// //           if (tx?.value?.confirmationStatus === "confirmed") {
// //             resolve(tx);
// //           }
// //         }
// //       }),
// //     ]);
// //   } catch (e) {
// //     if (e instanceof TransactionExpiredBlockheightExceededError) {
// //       // we consume this error and getTransaction would return null
// //       return null;
// //     } else {
// //       // invalid state from web3.js
// //       throw e;
// //     }
// //   } finally {
// //     controller.abort();
// //   }

// //   // in case rpc is not synced yet, we add some retries
// //   const response = promiseRetry(
// //     async (retry:any) => {
// //       const response = await connection.getTransaction(txid, {
// //         commitment: "confirmed",
// //         maxSupportedTransactionVersion: 0,
// //       });
// //       if (!response) {
// //         retry(response);
// //       }
// //       return response;
// //     },
// //     {
// //       retries: 5,
// //       minTimeout: 1e3,
// //     }
// //   );

// //   return response;
// // }
// // type TransactionSenderAndConfirmationWaiterArgs = {
// //   connection: Connection;
// //   serializedTransaction: Buffer;
// //   blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight;
// // };

// // const SEND_OPTIONS = {
// //   skipPreflight: false,
// //   commitment: 'processed' 
// // };