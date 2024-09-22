import {  CurveCalculator, CREATE_CPMM_POOL_PROGRAM, DEV_CREATE_CPMM_POOL_PROGRAM, CpmmPoolInfoLayout, CpmmConfigInfoInterface, InstructionType, CpmmComputeData } from '@raydium-io/raydium-sdk-v2';
import { Raydium, TxVersion, parseTokenAccountResp, CpmmKeys } from '@raydium-io/raydium-sdk-v2'
import { optimizedSendAndConfirmTransaction, wrapLegacyTx, add_mvx_and_ref_inx_fees, addMvxFeesInx } from '../../../util';
import { Connection, Keypair, PublicKey, VersionedTransaction, Transaction, TransactionMessage, AddressLookupTableAccount } from '@solana/web3.js'
import BigNumber from 'bignumber.js';
import dotenv from 'dotenv'; dotenv.config();
import bs58 from 'bs58'
import BN from 'bn.js'

import { SOL_ADDRESS } from '../../../../config';
import { sendJitoBundleRPC } from '../../jito';
import { set } from 'mongoose';
import { s } from '@raydium-io/raydium-sdk-v2/lib/api-8d4cc174';
import { program } from '@coral-xyz/anchor/dist/cjs/native/system';


export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

const VALID_PROGRAM_ID = new Set([CREATE_CPMM_POOL_PROGRAM.toBase58(), DEV_CREATE_CPMM_POOL_PROGRAM.toBase58()])
export const isValidCpmm = (id: string) => VALID_PROGRAM_ID.has(id)

export const txVersion = TxVersion.V0;

let raydium: Raydium | undefined;

export async function initSdk( connection: Connection) {
  if (raydium) return raydium
  // console.log("--c>, ", wallet.publicKey.toBase58());
  raydium = await Raydium.load({
    connection,
    cluster: 'mainnet',
    disableFeatureCheck: true,
    disableLoadToken: false
  });
  return raydium
}

export async function raydium_cpmm_swap(
  connection: Connection,
  wallet: Keypair,
  tradeSide: 'buy' | 'sell',
  poolId: string,
  inputAmount: number,
  slippage: number,
  ctx: any
): Promise<string | null> {
  let poolKeys: CpmmKeys | undefined
  const raydium = await initSdk( connection);
  raydium.setOwner(wallet)

  const [data,rpcData] = await Promise.all([
   raydium.cpmm.getPoolInfoFromRpc(poolId ),
   raydium.cpmm.getRpcPoolInfo(poolId, true)
  ])
  const poolInfo = data.poolInfo;
 
  rpcData.configInfo!.tradeFeeRate = new BN(0);
  const buyAddress =  poolInfo.mintA.address === SOL_ADDRESS ? poolInfo.mintA.address : poolInfo.mintB.address;
  const sellAddress = poolInfo.mintA.address === SOL_ADDRESS ? poolInfo.mintB.address : poolInfo.mintA.address;

  const inputMint = tradeSide == 'buy' ? buyAddress : sellAddress;
  const baseIn = inputMint === poolInfo.mintA.address;
  if (!isValidCpmm(poolInfo.programId)) throw new Error('target pool is not CPMM pool');
  
  const swapResult = CurveCalculator.swap(
    new BN(inputAmount),
    baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
    baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
    rpcData.configInfo!.tradeFeeRate
  );



    poolInfo.config.tradeFeeRate = 0
    poolInfo.feeRate = 0 
  // console.log('poolInfo:>>>><<>>>>> ', poolInfo);
  // range: 1 ~ 0.0001, means 100% ~ 0.01%e
  
  
  let { transaction  } = await raydium.cpmm.swap({
    poolInfo,
    poolKeys,
    payer: wallet.publicKey,
    baseIn,
    fixedOut: false,
    slippage: slippage * 100 / 10_000,
    swapResult,
    inputAmount: new BN(inputAmount),
    config: {
      checkCreateATAOwner: true,
      associatedOnly: true,
    },
    
    computeBudgetConfig: {
      microLamports: ctx.session.customPriorityFee * 1e9,
      
    }
  }).catch((e) => {
    console.log('error', e)
    throw new Error('Failed transaction')
  });

  const solAmount = tradeSide == 'buy' ? new BigNumber(swapResult.sourceAmountSwapped.toNumber()) : new BigNumber(swapResult.destinationAmountSwapped.toNumber());
  if (tradeSide == 'sell') {
    ctx.session.CpmmSolExtracted = solAmount
  }

   let txSig: any = '';
  if (transaction instanceof Transaction) {

    transaction.instructions.push(...addMvxFeesInx(wallet, solAmount));
    const tx = new VersionedTransaction(wrapLegacyTx(transaction.instructions, wallet, (await connection.getLatestBlockhash()).blockhash));
    tx.sign([wallet]);
    if(ctx.session.mevProtection){
      txSig = await sendJitoBundleRPC(connection, wallet, (ctx.session.mevProtectionAmount * 1e9).toString(), transaction)
    }else{
      txSig = await optimizedSendAndConfirmTransaction(
        tx, connection, (await connection.getLatestBlockhash()).blockhash, 50
      );
    }
  
  } 
  return txSig;
}

export async function getRayCpmmPoolKeys({ t1, t2, connection }: { t1: string, t2: string, connection: Connection }): Promise<PublicKey | undefined> {
  const commitment = "processed";
  const RAYDIUM_CPMM = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');

  const baseMint = new PublicKey(t1);
  const quoteMint = new PublicKey(t2);

  const accounts = await connection.getProgramAccounts(
    RAYDIUM_CPMM,
    {
      commitment,
      filters: [
        { dataSize: CpmmPoolInfoLayout.span },
        {
          memcmp: {
            offset: CpmmPoolInfoLayout.offsetOf("mintB"),
            bytes: baseMint.toBase58(),
          },
        },
        {
          memcmp: {
            offset: CpmmPoolInfoLayout.offsetOf("mintA"),
            bytes: quoteMint.toBase58(),
          },
        },
      ],
    }
  );

  // console.log('A: ', CpmmPoolInfoLayout.offsetOf("mintA"));
  // console.log('B: ', CpmmPoolInfoLayout.offsetOf("mintB"));
  // console.log('span: ', CpmmPoolInfoLayout.span);
  let poolId = accounts && accounts[0] && accounts[0].pubkey;
  // console.log("CPMM poolId: ", poolId?.toBase58());
  return poolId;
}



export async function getpoolDataCpmm(wallet: Keypair, poolID: any, connection: any): Promise<CpmmKeys> {
  console.log('we are fetching cpmm')
  const raydium = await initSdk( connection);
  raydium.setOwner(wallet)
  if (!poolID) {
    console.error('Pool Cpmm not found')
    throw new Error('Cpmm pool not found')
  }
  const cpmmPoolKeys = await raydium.cpmm.getCpmmPoolKeys(poolID)
  

  return cpmmPoolKeys;
}
// getpoolDataCpmm()
/**
 * By default: sdk will automatically fetch token account data when need it or any sol balace changed.
 * if you want to handle token account by yourself, set token account data after init sdk
 * code below shows how to do it.
 * note: after call raydium.account.updateTokenAccount, raydium will not automatically fetch token account
 */

// raydium.account.updateTokenAccount(await fetchTokenAccountData())
// connection.onAccountChange(wallet.publicKey, async () => {
//     raydium!.account.updateTokenAccount(await fetchTokenAccountData())
// })