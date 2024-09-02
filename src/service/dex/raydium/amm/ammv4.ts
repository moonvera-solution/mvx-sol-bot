import assert from "assert";
import { AMM_V4, AMM_STABLE, DEVNET_PROGRAM_ID, TxVersion } from '@raydium-io/raydium-sdk-v2'
import Decimal from 'decimal.js'
import {
  _100,
  jsonInfo2PoolKeys,
  Liquidity,
  LiquidityPoolKeys,
  Percent,
  Token,
  TokenAmount
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
  Transaction
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
import { S } from "@raydium-io/raydium-sdk-v2/lib/api-33b5ab27";
import { initSdk } from "../cpmm";
import { AmmRpcData, AmmV4Keys, ApiV3PoolInfoStandardItem } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import bs58 from "bs58";
// import { createAssociatedTokenAccount, getAssociatedTokenAddress } from "@solana/spl-token";
const { createAssociatedTokenAccount, getAssociatedTokenAddress} = require('@solana/spl-token');

// import { NATIVE_MINT } from '@solana/spl-token'
type refObject = { referralWallet: string, referralCommision: number };

export type TxInputInfo = {
    connection: Connection;
    side: "buy" | "sell";
    AmmPoolId: string;
    ammPoolKeys: AmmV4Keys | undefined;
    ammPoolInfo: ApiV3PoolInfoStandardItem;
    rpcData: AmmRpcData;
    outputToken: string;
    amountIn: number;
    slippage: number;
    customPriorityFee: number;
    wallet: Keypair;
  };

export async function raydium_amm_swap_v4(input: TxInputInfo): Promise<string | null> {
    // const txVersion = TxVersion.V0 // or TxVersion.LEGACY
    const VALID_PROGRAM_ID = new Set([
      AMM_V4.toBase58(),
      AMM_STABLE.toBase58(),
      DEVNET_PROGRAM_ID.AmmV4.toBase58(),
      DEVNET_PROGRAM_ID.AmmStable.toBase58(),
    ])
    const isValidAmm = (id: string) => VALID_PROGRAM_ID.has(id)
    const connection = input.connection;

    const raydium = await initSdk(input.wallet, connection)


    let poolInfo: ApiV3PoolInfoStandardItem | undefined
    let poolKeys: AmmV4Keys | undefined = input.ammPoolKeys

    // const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId: input.AmmPoolId })
    // console.log('data', data)
    poolInfo = input.ammPoolInfo;
    // console.log('poolInfo', poolInfo)
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

    // console.log('amountIn', input.amountIn)
    console.log('out', out)
    
    const { transaction } = await raydium.liquidity.swap({
      poolInfo,
      poolKeys,
      amountIn: new BN(input.amountIn),
      amountOut: out.minAmountOut, // out.amountOut means amount 'without' slippage
      fixedSide: 'in',
      inputMint: mintIn.address,   
      config: {
        inputUseSolBalance:  input.side === 'buy' ? true : false, // default: true, if you want to use existed wsol token account to pay token in, pass false
        outputUseSolBalance:  input.side === 'buy' ? false : true, // default: true, if you want to use existed wsol token account to receive token out, pass false
        associatedOnly: true, // default: true, if you want to use ata only, pass true
      }, 
      computeBudgetConfig: {
        microLamports: input.customPriorityFee * 1e9,
      }

    }).catch((e) => {
      console.log('error', e)
      throw new Error('Failed transaction')
    })
  
    const solAmount = input.side == 'buy' ? new BigNumber(input.amountIn) : new BigNumber(out.minAmountOut.toNumber());

    // console.log('solAmount', solAmount)
    let txId: any = '';


    
    if (transaction instanceof Transaction) {
      console.log('transaction frpm tx here')
      // transaction.instructions.push(...addMvxFeesInx(input.wallet, solAmount));
      const blockhash = await connection.getLatestBlockhash();
      const vTxx = new VersionedTransaction(wrapLegacyTx(transaction.instructions, input.wallet, blockhash.blockhash));

      const addressLookupTableAccounts = await Promise.all(
          vTxx.message.addressTableLookups.map(async (lookup) => {
              return new AddressLookupTableAccount({
                  key: lookup.accountKey,
                  state: AddressLookupTableAccount.deserialize(await connection.getAccountInfo(lookup.accountKey).then((res) => res!.data)),
              })
          }));

      var message = TransactionMessage.decompile(vTxx.message, { addressLookupTableAccounts: addressLookupTableAccounts })
      vTxx.message = message.compileToV0Message(addressLookupTableAccounts);
      vTxx.sign([input.wallet]);

      txId = await optimizedSendAndConfirmTransaction(
        vTxx, connection, (await connection.getLatestBlockhash()).blockhash, 50
      );
    } else if (transaction instanceof VersionedTransaction) {
      console.log('transaction from versioned tx here')
      const addressLookupTableAccounts = await Promise.all(
        transaction.message.addressTableLookups.map(async (lookup) => {
          return new AddressLookupTableAccount({
            key: lookup.accountKey,
            state: AddressLookupTableAccount.deserialize(await connection.getAccountInfo(lookup.accountKey).then((res) => res!.data)),
          })
        }));
      var message = TransactionMessage.decompile(transaction.message, { addressLookupTableAccounts: addressLookupTableAccounts })
      txId = await optimizedSendAndConfirmTransaction(
        new VersionedTransaction(transaction.message), connection, (await connection.getLatestBlockhash()).blockhash, 50
      );
    }
    return txId;
  
    }


    export async function getOrCreateATA(wallet: Keypair, token: PublicKey, connection: Connection) {
      let ata: PublicKey | null = null
      // Check if the associated token account exists
      const associatedTokenAddress = await getAssociatedTokenAddress(
          new PublicKey(token),
          wallet.publicKey
      );
  
      // Check if the account exists
      const accountInfo = await connection.getAccountInfo(associatedTokenAddress, 'confirmed');
      if (!accountInfo) {
          // Create the associated token account if it doesn't exist
          ata = await createAssociatedTokenAccount(connection, wallet, new PublicKey(token), wallet.publicKey, {commitment: 'confirmed'});
          ata && console.log('Created ATA', ata.toBase58());
      }
      ata && console.log('Created ATA', ata.toBase58());
      return ata;
  }