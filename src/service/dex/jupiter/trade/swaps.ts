// // https://station.jup.ag/docs/apis/swap-api
import dotenv from 'dotenv';
dotenv.config();
import { Keypair, Connection, PublicKey, VersionedTransaction, ComputeBudgetProgram,sendAndConfirmTransaction,TransactionMessage} from "@solana/web3.js";
import bs58 from 'bs58';
import {transactionSenderAndConfirmationWaiter} from '../utils/transactionSender';
import {getSignature} from '../utils/getSignature';
import {MVX_JUP_REFERRAL,JUP_REF_PROGRAM, SOL_ADDRESS,WEN_ADDRESS,JUP_AGGREGATOR_V6} from '../../../../config';
import {sendTx,add_mvx_and_ref_inx_fees,addMvxFeesInx,wrapLegacyTx} from '../../../util';
import {JupiterSwapTokenRef} from '../../../../../src/db/mongo/schema';
import { getMaxPrioritizationFeeByPercentile } from "../../../fees/priorityFees";
import BigNumber from 'bignumber.js';
import axios from "axios";


// /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
// /*                  Jupiter SimpleSwap                        */
// /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
const COMMITMENT_LEVEL = "confirmed";
const PRIORITY_FEE_LAMPORTS = 1;
const TX_RETRY_INTERVAL =25;

const connection = new Connection(`${process.env.TRITON_RPC_URL!}${process.env.TRITON_RPC_TOKEN!}`);
// const wallet = Keypair.fromSecretKey(bs58.decode(process.env.TEST_WALLET_PK!));
type REFERRAL_INFO = {
  referralWallet: string | null,
  referralCommision: number | null
}
export async function jupiterSimpleSwap(
  connection:Connection,
  rpcUrl:string,
  userWallet:Keypair,
  isBuySide: boolean,
  tokenIn:string,
  tokenOut:string,
  amountIn:number,
  slippage:number,
  priorityFeeLevel:number,
  referralInfo:REFERRAL_INFO,
){
  let quoteResponse;
  let jupiterSwapTransaction;

  let txSignature = '';
  let confirmTransactionPromise :any= null;
  let confirmedTx = null;
  let blockhash = await connection.getLatestBlockhash();

  let swapApiResult = await axios.get(
    `${rpcUrl}/jupiter/quote?inputMint=${tokenIn}&outputMint=${tokenOut}&amount=${amountIn}&slippageBps=${slippage}`
  );

  const lastRouteHop = swapApiResult.data.routePlan[swapApiResult.data.routePlan.length - 1].swapInfo.ammKey;
  console.log("lastRouteHop::",lastRouteHop, ":: ",swapApiResult.data.routePlan);
  
  if (!(swapApiResult.status >= 200) && swapApiResult.status < 300) {
    throw new Error(`Failed to fetch jupiter swap quote: ${swapApiResult.status}`);
  }
  quoteResponse = swapApiResult.data;
  // const maxPriorityFee = await getMaxPrioritizationFeeByPercentile(connection, {lockedWritableAccounts: [new PublicKey(String(lastRouteHop))], percentile: priorityFeeLevel});

  swapApiResult = await axios.post(`${rpcUrl}/jupiter/swap`, {
    quoteResponse: quoteResponse,
    prioritizationFeeLamports: 100000,
    userPublicKey: userWallet.publicKey.toBase58(),
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true, // Setting this to `true` allows the endpoint to set the dynamic compute unit limit as required by the transaction
    jitoTipLamports: 5000, // Setting the priority fees. This can be `auto` or lamport numeric value
    skipUserAccountsRpcCalls: false,
  });
  
  // console.log("swapApiResult:: ",swapApiResult);
  // throw error if response is not ok
  if (!(swapApiResult.status >= 200) && swapApiResult.status < 300) {
    throw new Error(
      `Failed to fetch jupiter swap transaction: ${swapApiResult.status}`
    );
  }

  jupiterSwapTransaction = swapApiResult.data;

  try {
    console.log(`${new Date().toISOString()} Fetched jupiter swap transaction`);

    const swapTransactionBuf = Buffer.from(jupiterSwapTransaction.swapTransaction,"base64");

    const tx = VersionedTransaction.deserialize(swapTransactionBuf);
    tx.message.recentBlockhash = blockhash.blockhash;

    // Sign the transaction
    tx.sign([userWallet]);

    // Simulating the transaction
    const simulationResult = await connection.simulateTransaction(tx, {commitment: "processed",});
    console.log(`${new Date().toISOString()} Transaction simulation result:`,simulationResult);
    if (simulationResult.value.err) {
      throw new Error(
        `Transaction simulation failed with error ${JSON.stringify(
          simulationResult.value.err
        )}`
      );
    }

    console.log(`${new Date().toISOString()} Transaction simulation successful result:`);
    console.log(simulationResult);

    const signatureRaw = tx.signatures[0];
    txSignature = bs58.encode(signatureRaw);

    let txSendAttempts = 1;

    console.log(`${new Date().toISOString()} Subscribing to transaction confirmation`);

    // confirmTransaction throws error, handle it
    confirmTransactionPromise = connection.confirmTransaction({
        signature: txSignature,
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
      },
      "confirmed"
    );

    console.log(`${new Date().toISOString()} Sending Transaction ${txSignature}`);
    await connection.sendRawTransaction(tx.serialize(), {
      // Skipping preflight i.e. tx simulation by RPC as we simulated the tx above
      // This allows Triton RPCs to send the transaction through multiple pathways for the fastest delivery
      skipPreflight: true,
      // Setting max retries to 0 as we are handling retries manually
      // Set this manually so that the default is skipped
      maxRetries: 0,
    });

    confirmedTx = null;
        while (!confirmedTx) {
          confirmedTx = await Promise.race([
            confirmTransactionPromise,
            new Promise((resolve) =>
              setTimeout(() => {
                resolve(null);
              }, TX_RETRY_INTERVAL)
            ),
          ]);
          if (confirmedTx) {
            break;
          }

          console.log(`${new Date().toISOString()} Tx not confirmed after ${TX_RETRY_INTERVAL * txSendAttempts++}ms, resending`);

          await connection.sendRawTransaction(tx.serialize(), {
            // Skipping preflight i.e. tx simulation by RPC as we simulated the tx above
            // This allows Triton RPCs to send the transaction through multiple pathways for the fastest delivery
            skipPreflight: true,
            // Setting max retries to 0 as we are handling retries manually
            // Set this manually so that the default is skipped
            maxRetries: 0,
          });
        }
    } catch (e) {
      console.error(`${new Date().toISOString()} Error: ${e}`);
    }

    if (!confirmedTx) {
      console.log(`${new Date().toISOString()} Transaction failed`);
      return;
    }
    console.log(`${new Date().toISOString()} Transaction successful`);
    console.log(`${new Date().toISOString()} Explorer URL: https://solscan.io/tx/${txSignature}`);

    // txSignature = `https://solscan.io/tx/${txSignature}`;
    return txSignature;

  }

// jupiterSimpleSwap(
//   connection,
//   'https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41',
//   wallet,
//   false,
//   SOL_ADDRESS,
//   WEN_ADDRESS,
//   1000000,
//   5000,
//   5000,
//   {referralWallet:null, referralCommision:null},
// ).then((tx) => tx);

// TOOK LESS THAN HALF SECOND
// FASTER 56 -49 ms than the previous one
// WE GOT IT - not the FUCKIN UI


//   const feeAccount = null// await getTokenRefFeeAccount(tokenIn);
//   const { swapTransaction } = await ( await fetch(`${rpcUrl}/jupiter/swap`, { method: 'POST', headers: {'Content-Type': 'applixcation/json'},
//       body: JSON.stringify({ quoteResponse, userPublicKey: wallet.publicKey.toString(), wrapAndUnwrapSol: true}),  // Optional feeAccount Use if you want to charge a fee. feeBps must have been passed in /quote API.
//     })).json();
//   const maxPriorityFee = await getMaxPrioritizationFeeByPercentile(connection, {lockedWritableAccounts: [new PublicKey(JUP_AGGREGATOR_V6)], percentile: priorityFeeLevel});
//   const pFeeInx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: maxPriorityFee })

//   // 1. Deserialize and sign jupiter api quote swap instruction
//   console.log("swapTransaction:: ",typeof swapTransaction)
//   // const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
//   var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
//   transaction.sign([wallet]);

//   const txId = getSignature(transaction);

//   // 1.1 Simulate swap
//   const { value: simulatedTransactionResponse } =
//     await connection.simulateTransaction(transaction, {
//       replaceRecentBlockhash: true,
//       commitment: "processed",
//     });
//   const { err, logs } = simulatedTransactionResponse;

//   if (err) {
//     // Simulation error, we can check the logs for more details
//     // If you are getting an invalid account error, make sure that you have the input mint account to actually swap from.
//     console.error("Simulation Error:");
//     console.error({ err, logs });
//     return;
//   }

//   // 2.- Init tx bundle and add swap inx
//   // const versionnedBundle: VersionedTransaction[] = [];
//   // const swapTx = new VersionedTransaction(transaction.message);
//   // versionnedBundle.push(swapTx);

//   // // 3.- Add mvx fee & referral fee inx if ref exists
//   const hasReferral = referralInfo.referralWallet && referralInfo.referralCommision;
//   let solAmount: BigNumber = isBuySide ? new BigNumber(amountIn) : new BigNumber(quoteResponse.outAmount);
//   solAmount = solAmount.dividedBy(1e9);

//   // const mvxTx = new VersionedTransaction(wrapLegacyTx(txInxs, userWallet, blockHash));
//   // versionnedBundle.push(mvxTx);

//   // // 4.- Add priority fees inx
//   // const maxPriorityFee = await getMaxPrioritizationFeeByPercentile(connection, {lockedWritableAccounts: [new PublicKey(JUP_AGGREGATOR_V6)], percentile: priorityFeeLevel});
//   // console.log(`Max Priority Fee: ${maxPriorityFee}`);
//   // let pFeeTx = new TransactionMessage({payerKey: userWallet.publicKey,recentBlockhash: blockHash,instructions: [pFeeInx]});
//   // let pFeeTxx = new VersionedTransaction(wrapLegacyTx(pFeeTx.instructions, userWallet, blockHash));
//   // // versionnedBundle.push(pFeeTxx);

//   const txInxs = hasReferral ?
//   add_mvx_and_ref_inx_fees(userWallet, referralInfo.referralWallet!, solAmount, referralInfo.referralCommision!) :
//   addMvxFeesInx(userWallet, solAmount)
//   // swapTransaction.add(pFeeInx);

//   // swapTransaction.add(txInxs);

//   // 5.- Send tx bundle
//   // const tx = (await sendAndConfirmTransaction(connection,versionnedBundle,[userWallet],{ preflightCommitment: "processed", }))[0];
//   const serializedTransaction = Buffer.from(transaction.serialize());
//   const blockhash = transaction.message.recentBlockhash;

//     const transactionResponse = await transactionSenderAndConfirmationWaiter({
//       connection,
//       serializedTransaction,
//       blockhashWithExpiryBlockHeight: {
//         blockhash,
//         lastValidBlockHeight: quoteResponse.lastValidBlockHeight,
//       },
//     });
  
//   console.log("transactionResponse: ",transactionResponse);
//   console.log("txId: ",`https://solscan.io/tx/${txId}`);
//   return txId;
  
// }



/**
 * Every token to swap requires a token referral fee account for tx.
 * Independent of user, we store ref tokens in db
 * @param token Swap token out, not SOL
 * @returns refTokenAccount if id tokenIn exists in db else creates and returns
 */
async function getTokenRefFeeAccount(token:string) : Promise<PublicKey | null> {
  try{
    let refEntry = await JupiterSwapTokenRef.findOne({id: token})
    if(!refEntry){
      const [feeAccount] = await PublicKey.findProgramAddressSync([Buffer.from("referral_ata"),
          new PublicKey(MVX_JUP_REFERRAL).toBuffer(), // your referral account public key
          new PublicKey(token).toBuffer(), // the token mint, output mint for ExactIn, input mint for ExactOut.
        ],new PublicKey(JUP_REF_PROGRAM) // the Referral Program
      );
      refEntry = new JupiterSwapTokenRef({ id: token, ref: feeAccount.toBase58() });
      await refEntry.save();
      return feeAccount;
    }else if(refEntry){
      return new PublicKey(refEntry.ref!);
    }
    return null;
  }catch(error:any){
    console.log(error)
    return null;
  }
}

// /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
// /*                            SWAP                            */
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