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

// import { NATIVE_MINT } from '@solana/spl-token'
type refObject = { referralWallet: string, referralCommision: number };

export type TxInputInfo = {
    connection: Connection;
    side: "buy" | "sell";
    generatorWallet: PublicKey;
    referralCommision: number;
    outputToken: Token;
    targetPool: string;
    inputTokenAmount: TokenAmount;
    slippage: Percent;
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
    const targetPoolInfo = await formatAmmKeysById(input.targetPool, connection);
    const oldPoolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys;
    const raydium = await initSdk(input.wallet, connection)
    const amountIn = Number(input.inputTokenAmount);
    const inputMint =  String(input.outputToken.mint.toBase58());
    const poolv4ID = oldPoolKeys.id.toString()
    let poolInfo: ApiV3PoolInfoStandardItem | undefined
    let poolKeys: AmmV4Keys | undefined
    let rpcData: AmmRpcData
  
    const data = await raydium.api.fetchPoolById({ ids: poolv4ID })
    poolInfo = data[0] as ApiV3PoolInfoStandardItem
    console.log('poolInfo', poolInfo) 
    if (!isValidAmm(poolInfo.programId)) throw new Error('target pool is not AMM pool')
    poolKeys = await raydium.liquidity.getAmmPoolKeys(poolv4ID);
    rpcData = await raydium.liquidity.getRpcPoolInfo(poolv4ID);
    const [baseReserve, quoteReserve, status] = [rpcData.baseReserve, rpcData.quoteReserve, rpcData.status.toNumber()]
    if (poolInfo.mintA.address !== inputMint && poolInfo.mintB.address !== inputMint)
      throw new Error('input mint does not match pool')
    const baseIn = inputMint === poolInfo.mintA.address
    const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA]
    const out = raydium.liquidity.computeAmountOut({
      poolInfo: {
        ...poolInfo,
        baseReserve,
        quoteReserve,
        status,
        version: 4,
      },
      amountIn: new BN(amountIn),
      mintIn: mintIn.address,
      mintOut: mintOut.address,
      slippage: 0.11, // range: 1 ~ 0.0001, means 100% ~ 0.01%
      
    })
    console.log('out', out.amountOut.toNumber())
    console.log('out', out.minAmountOut.toNumber())
    
    const { transaction } = await raydium.liquidity.swap({
      poolInfo,
      poolKeys,
      amountIn: new BN(amountIn),
      amountOut: out.minAmountOut, // out.amountOut means amount 'without' slippage
      fixedSide: 'in',
      inputMint: mintIn.address,
      // slippage: 0.1,
      computeBudgetConfig: {
        microLamports: 0.0001 * 1e9,
      }
    })
  
    let feeAmt = Number.isInteger(out.minAmountOut.toNumber()) ? out.minAmountOut.toNumber() : Math.ceil(Number.parseFloat(out.minAmountOut.toNumber().toFixed(2)));
  
    
    let txId: any = '';
    if (transaction instanceof Transaction) {
  
      transaction.instructions.push(...addMvxFeesInx(input.wallet, BigNumber(feeAmt)));
      addMvxFeesInx(input.wallet, BigNumber(feeAmt));
      const tx = new VersionedTransaction(wrapLegacyTx(transaction.instructions, input.wallet, (await connection.getLatestBlockhash()).blockhash));
      tx.sign([input.wallet]);
      txId = await optimizedSendAndConfirmTransaction(
        tx, connection, (await connection.getLatestBlockhash()).blockhash, 50
      );
    } else if (transaction instanceof VersionedTransaction) {
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