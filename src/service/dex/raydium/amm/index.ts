
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

