import assert from "assert";
import { AMM_V4, AMM_STABLE, DEVNET_PROGRAM_ID, TxVersion, AmmV5Keys } from '@raydium-io/raydium-sdk-v2'
import Decimal from 'decimal.js'
import {
  _100,

} from "@raydium-io/raydium-sdk";
const NATIVE_MINT = require('@solana/spl-token')

import BigNumber from "bignumber.js";
import {
  SystemProgram,
  ComputeBudgetProgram,
  Connection,
  SendOptions,
  VersionedTransaction,
  TransactionMessage,
  AddressLookupTableAccount,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import {
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  makeTxVersion,
  MVXBOT_FEES,
  SOL_ADDRESS,
  WALLET_MVX
} from "../../../../config";
import { formatAmmKeysById } from "../utils/formatAmmKeysById";
import { simulateTx, getMaxPrioritizationFeeByPercentile, PriotitizationFeeLevels } from "../../../fees/priorityFees";
import {
  buildAndSendTx,
  getWalletTokenAccount,
  optimizedSendAndConfirmTransaction,
  wrapLegacyTx,
  add_mvx_and_ref_inx_fees,
  addMvxFeesInx
} from "../../../util";
// import { S } from "@raydium-io/raydium-sdk-v2/lib/api-33b5ab27";
import { initSdk, txVersion } from "../cpmm";
import { AmmRpcData, AmmV4Keys, ApiV3PoolInfoStandardItem } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import bs58 from "bs58";
import { use } from "chai";
import {TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID} from './associatedTokenAccount'
import { createAssociatedTokenAccountIdempotentInstruction } from './associatedTokenAccount'
import { SOL } from "@metaplex-foundation/js";
import { get } from "axios";
import { connect } from "http2";
import { version } from "os";
import { skip } from "node:test";





export type TxInputInfo = {
    connection: Connection;
    side: "buy" | "sell";
    AmmPoolId: string;
    ammPoolKeys: AmmV4Keys | AmmV5Keys;
    ammPoolInfo: ApiV3PoolInfoStandardItem;
    rpcData: AmmRpcData;
    outputToken: string;
    amountIn: number;
    slippage: number;
    customPriorityFee: number;
    wallet: Keypair;
  };

export async function raydium_amm_swap_v4(input: TxInputInfo): Promise<string | null> {
    const txVersion = TxVersion.V0 // or TxVersion.LEGACY
    const VALID_PROGRAM_ID = new Set([
      AMM_V4.toBase58(),
      AMM_STABLE.toBase58(),
      DEVNET_PROGRAM_ID.AmmV4.toBase58(),
      DEVNET_PROGRAM_ID.AmmStable.toBase58(),
    ])
    const isValidAmm = (id: string) => VALID_PROGRAM_ID.has(id)
    const connection = input.connection;

    const raydium = await initSdk( connection)
    raydium.setOwner(input.wallet)


    let poolInfo: ApiV3PoolInfoStandardItem 
    let poolKeys: AmmV4Keys  = input.ammPoolKeys


    poolInfo = input.ammPoolInfo;

    const modifiedPoolInfo = { ...poolInfo };

    if(poolInfo.mintA.address === SOL_ADDRESS){
      modifiedPoolInfo.mintA = poolInfo.mintB;
      modifiedPoolInfo.mintB = poolInfo.mintA;
      modifiedPoolInfo.mintAmountA = poolInfo.mintAmountB;
      modifiedPoolInfo.mintAmountB = poolInfo.mintAmountA;
      // modifiedPoolInfo.feeRate = 0;
    }
    // console.log('modifiedPoolInfo', modifiedPoolInfo)
    if (!isValidAmm(poolInfo.programId)) throw new Error('target pool is not AMM pool')
    const [baseReserve, quoteReserve, status] = [input.rpcData.baseReserve, input.rpcData.quoteReserve, input.rpcData.status.toNumber()]
    const mintIn = input.side === 'buy' ? modifiedPoolInfo.mintB : modifiedPoolInfo.mintA
    const mintOut = input.side === 'sell' ? modifiedPoolInfo.mintA : modifiedPoolInfo.mintB
    let out: any;



  // console.log('finding out')

  try{
    out = raydium.liquidity.computeAmountOut({
      poolInfo: {
        ...modifiedPoolInfo,
        baseReserve,
        quoteReserve,
        status,
        version: 4,
      },
      amountIn: new BN(input.amountIn),
      mintIn: mintIn.address,
      mintOut: mintOut.address,
      slippage: input.slippage, // range: 1 ~ 0.0001, means 100% ~ 0.01%

    })
  }catch(e){
    console.log('error', e)
    throw new Error('Failed transaction')
  }



    const  { transaction }  = await raydium.liquidity.swap({
      poolInfo, 
      poolKeys,
      amountIn: new BN(input.amountIn),
      amountOut: out.minAmountOut, // out.amountOut means amount 'without' slippage
      inputMint: mintIn.address,   
      fixedSide:'in',
      config: {
        associatedOnly:  false,
        inputUseSolBalance: true,
        outputUseSolBalance: true,
      }, 
      computeBudgetConfig: {
        microLamports: input.customPriorityFee * 1e9,
      },
      txVersion: txVersion
    }).catch((e) => {
      console.log('error', e)
      throw new Error('Failed transaction')
    })

    // console.log('transaction', transaction) 
    
    const solAmount = input.side == 'buy' ? new BigNumber(input.amountIn) : new BigNumber(out.amountOut.toNumber());

    // console.log('solAmount', solAmount)
    let txId: any = '';
    if (transaction instanceof Transaction) {
      console.log('getting in here trx')
      transaction.instructions.push(...addMvxFeesInx(input.wallet, solAmount));
      // addMvxFeesInx(input.wallet, solAmount);
      const tx = new VersionedTransaction(wrapLegacyTx(transaction.instructions, input.wallet, (await connection.getLatestBlockhash()).blockhash));
      tx.sign([input.wallet]);
      txId = await optimizedSendAndConfirmTransaction(
        tx, connection, (await connection.getLatestBlockhash()).blockhash, 50
      );
    } else if (transaction instanceof VersionedTransaction) {
      console.log('getting in here vtrx')
      const addressLookupTableAccounts = await Promise.all(
        transaction.message.addressTableLookups.map(async (lookup) => {
          return new AddressLookupTableAccount({
            key: lookup.accountKey,
            state: AddressLookupTableAccount.deserialize(await connection.getAccountInfo(lookup.accountKey).then((res) => res!.data)),
          })
        }));
      var message = TransactionMessage.decompile(transaction.message, { addressLookupTableAccounts: addressLookupTableAccounts })
      message.instructions.push(...addMvxFeesInx(input.wallet, solAmount));
     const  txIVd = new VersionedTransaction(transaction.message);
     txIVd.message.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
     txIVd.sign([input.wallet]);      
      txId = await optimizedSendAndConfirmTransaction(
        txIVd, connection, (await connection.getLatestBlockhash()).blockhash, 50
      );
    }
    return txId;

    
    
    }
    





  //   export async function getOrCreateATA(wallet: Keypair, token: PublicKey, connection: Connection) {
  //     let ata: PublicKey | null = null
  //     let ata2: PublicKey | null = null
  //     // Check if the associated token account exists
  //     const associatedTokenAddress = await getAssociatedTokenAddress(
  //         new PublicKey(SOL_ADDRESS),
  //         wallet.publicKey
  //     );
  //     const associatedTokenAddress2 = await getAssociatedTokenAddress(
  //         new PublicKey(token),
  //         wallet.publicKey
  //     );
      
  
  //     // Check if the account exists
  //     const accountInfo = await connection.getAccountInfo(associatedTokenAddress);
  //     const accountInfo2 = await connection.getAccountInfo(associatedTokenAddress2);
  //     console.log('accountInfo', accountInfo) 
  //     console.log('accountInfo2', accountInfo2)
  //     if (!accountInfo) {
  //         // Create the associated token account if it doesn't exist
  //         ata = await createAssociatedTokenAccount(connection, wallet, new PublicKey(token), wallet.publicKey);
  //         ata2 = await createAssociatedTokenAccount(connection, wallet, new PublicKey(SOL_ADDRESS), wallet.publicKey);
  //     }

  //     return ata;
  // }

  