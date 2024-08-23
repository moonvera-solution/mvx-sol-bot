
import assert from "assert";
import { AMM_V4, AMM_STABLE, DEVNET_PROGRAM_ID, TxVersion } from '@raydium-io/raydium-sdk-v2'

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

export async function raydium_amm_swap(input: TxInputInfo): Promise<string | null> {
  console.log('going ray')
  const connection = input.connection;
  const targetPoolInfo = await formatAmmKeysById(input.targetPool, connection);
  assert(targetPoolInfo, "cannot find the target pool");
  const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys;
  let minSwapAmountBalance: number = 0;
  /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
  /*                       QUOTE SWAP                           */
  /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-xwxwwx»-»-»-»-»*/

    const { amountOut, minAmountOut } = Liquidity.computeAmountOut({
      poolKeys: poolKeys,
      poolInfo: await Liquidity.fetchInfo({ connection, poolKeys }),
      amountIn: input.inputTokenAmount,
      currencyOut: input.outputToken,
      slippage: input.slippage,
    });


  /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
  /*                      MAKE RAYIDUM INX                      */
  /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
  const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
    connection,
    poolKeys,
    userKeys: {
      tokenAccounts: (await getWalletTokenAccount(connection, new PublicKey(input.wallet.publicKey))),
      owner: input.wallet.publicKey,
    },
    amountIn: input.inputTokenAmount,
    amountOut: minAmountOut,
    fixedSide: "in",
    makeTxVersion
  });
  /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
  /*                      REFERRAL AMOUNT                      */
  /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
  // In case of having a referral
  // const referralFee = input.referralCommision / 100;
 
  // if (referralFee > 0) {
  //   innerTransactions[0].instructions.push(
  //     ...add_mvx_and_ref_inx_fees(
  //       input.wallet,
  //       new PublicKey(input.generatorWallet).toBase58(),
  //       input.side === "sell" ? new BigNumber(amountOut.raw.toNumber() ): new BigNumber(input.inputTokenAmount.raw.toNumber()),
  //       input.referralCommision
  //     ));
  // } else {
  //   let feeAmt = Number.isInteger(amountOut.raw.toNumber()) ? amountOut.raw.toNumber() : Math.ceil(Number.parseFloat(amountOut.raw.toNumber().toFixed(2)));
  //   console.log("feeAmt:: ", feeAmt);
  //   innerTransactions[0].instructions.push(
  //     ...addMvxFeesInx(
  //       input.wallet,
  //       input.side === "sell" ? new BigNumber(feeAmt) : new BigNumber(input.inputTokenAmount.raw.toNumber())
  //     )
  //   );
  // }
  let feeAmt = Number.isInteger(amountOut.raw.toNumber()) ? amountOut.raw.toNumber() : Math.ceil(Number.parseFloat(amountOut.raw.toNumber().toFixed(2)));
  console.log("feeAmt:: ", feeAmt);
  innerTransactions[0].instructions.push(
    ...addMvxFeesInx(
      input.wallet,
      input.side === "sell" ? new BigNumber(feeAmt) : new BigNumber(input.inputTokenAmount.raw.toNumber())
    )
  );
  // console.log("input.customPriorityFee:: ", input.customPriorityFee);
  let maxPriorityFee = Math.ceil(Number.parseFloat(String(input.customPriorityFee)) * 1e9);
  console.log("maxPriorityFee:: ", maxPriorityFee);
  innerTransactions[0].instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: maxPriorityFee }));
  // console.log("referralFee:: ", referralFee);

  const vTxx = new VersionedTransaction(wrapLegacyTx(innerTransactions[0].instructions, input.wallet, (await connection.getLatestBlockhash()).blockhash));
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
  console.log('is sending transaction!!!!!!!!');
  return await optimizedSendAndConfirmTransaction(
    vTxx,
    connection,
    (await connection.getLatestBlockhash()).blockhash,
    50 // RETRY INTERVAL
  )
  return null;
}

// export async function raydium_amm_swap_v4(input: TxInputInfo): Promise<string | null> {
//   // const txVersion = TxVersion.V0 // or TxVersion.LEGACY
//   const VALID_PROGRAM_ID = new Set([
//     AMM_V4.toBase58(),
//     AMM_STABLE.toBase58(),
//     DEVNET_PROGRAM_ID.AmmV4.toBase58(),
//     DEVNET_PROGRAM_ID.AmmStable.toBase58(),
//   ])
//   const isValidAmm = (id: string) => VALID_PROGRAM_ID.has(id)
//   const connection = input.connection;
//   const targetPoolInfo = await formatAmmKeysById(input.targetPool, connection);
//   assert(targetPoolInfo, "cannot find the target pool");
//   const oldPoolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys;
//   const raydium = await initSdk(input.wallet, connection)
//   const amountIn = Number(input.inputTokenAmount);
//   console.log(' input.outputToken',  input.outputToken.mint.toBase58())
//   const inputMint =  String(input.outputToken.mint.toBase58());
//   const poolv4ID = oldPoolKeys.id.toString()
//   let poolInfo: ApiV3PoolInfoStandardItem | undefined
//   let poolKeys: AmmV4Keys | undefined
//   let rpcData: AmmRpcData

//   const data = await raydium.api.fetchPoolById({ ids: poolv4ID })
//   poolInfo = data[0] as ApiV3PoolInfoStandardItem
//   console.log('poolInfo', poolInfo) 
//   if (!isValidAmm(poolInfo.programId)) throw new Error('target pool is not AMM pool')
//   poolKeys = await raydium.liquidity.getAmmPoolKeys(poolv4ID);
//   rpcData = await raydium.liquidity.getRpcPoolInfo(poolv4ID);
//   const [baseReserve, quoteReserve, status] = [rpcData.baseReserve, rpcData.quoteReserve, rpcData.status.toNumber()]
//   if (poolInfo.mintA.address !== inputMint && poolInfo.mintB.address !== inputMint)
//     throw new Error('input mint does not match pool')
//   const baseIn = inputMint === poolInfo.mintA.address
//   const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA]
//   const out = raydium.liquidity.computeAmountOut({
//     poolInfo: {
//       ...poolInfo,
//       baseReserve,
//       quoteReserve,
//       status,
//       version: 4,
//     },
//     amountIn: new BN(amountIn),
//     mintIn: mintIn.address,
//     mintOut: mintOut.address,
//     slippage: 0.11, // range: 1 ~ 0.0001, means 100% ~ 0.01%
    
//   })
//   console.log('out', out.amountOut.toNumber())
//   console.log('out', out.minAmountOut.toNumber())
  
//   const { transaction } = await raydium.liquidity.swap({
//     poolInfo,
//     poolKeys,
//     amountIn: new BN(amountIn),
//     amountOut: out.minAmountOut, // out.amountOut means amount 'without' slippage
//     fixedSide: 'in',
//     inputMint: mintIn.address,
//     // slippage: 0.1,
//     computeBudgetConfig: {
//       microLamports: 0.0001 * 1e9,
//     }
//   })

//   let feeAmt = Number.isInteger(out.minAmountOut.toNumber()) ? out.minAmountOut.toNumber() : Math.ceil(Number.parseFloat(out.minAmountOut.toNumber().toFixed(2)));

  
//   let txId: any = '';
//   if (transaction instanceof Transaction) {

//     transaction.instructions.push(...addMvxFeesInx(input.wallet, BigNumber(feeAmt)));
//     addMvxFeesInx(input.wallet, BigNumber(feeAmt));
//     const tx = new VersionedTransaction(wrapLegacyTx(transaction.instructions, input.wallet, (await connection.getLatestBlockhash()).blockhash));
//     tx.sign([input.wallet]);
//     txId = await optimizedSendAndConfirmTransaction(
//       tx, connection, (await connection.getLatestBlockhash()).blockhash, 50
//     );
//   } else if (transaction instanceof VersionedTransaction) {
//     const addressLookupTableAccounts = await Promise.all(
//       transaction.message.addressTableLookups.map(async (lookup) => {
//         return new AddressLookupTableAccount({
//           key: lookup.accountKey,
//           state: AddressLookupTableAccount.deserialize(await connection.getAccountInfo(lookup.accountKey).then((res) => res!.data)),
//         })
//       }));
//     var message = TransactionMessage.decompile(transaction.message, { addressLookupTableAccounts: addressLookupTableAccounts })

   
//     txId = await optimizedSendAndConfirmTransaction(
//       new VersionedTransaction(transaction.message), connection, (await connection.getLatestBlockhash()).blockhash, 50
//     );
//   }
//   return txId;

//   }