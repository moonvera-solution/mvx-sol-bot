
import assert from "assert";
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
  AddressLookupTableAccount
} from "@solana/web3.js";
import {
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  makeTxVersion,
  MVXBOT_FEES,
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

type refObject = { referralWallet: string, referralCommision: number };

export type TxInputInfo = {
  connection: Connection;
  side: "buy" | "sell";
  refObject: refObject;
  outputToken: Token;
  targetPool: string;
  inputTokenAmount: TokenAmount;
  slippage: Percent;
  customPriorityFee: number;
  wallet: Keypair;
};

export async function raydium_amm_swap(input: TxInputInfo): Promise<string | null> {
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
  const referralFee = input.refObject.referralCommision / 100;

  if (referralFee > 0) {
    innerTransactions[0].instructions.push(
      ...add_mvx_and_ref_inx_fees(
        input.wallet,
        input.refObject.referralWallet,
        input.side === "sell" ? new BigNumber(amountOut.raw.toNumber() ): new BigNumber(input.inputTokenAmount.raw.toNumber()),
        input.refObject.referralCommision
      ));
  } else {
    innerTransactions[0].instructions.push(
      ...addMvxFeesInx(
        input.wallet,
        input.side === "sell" ? new BigNumber(amountOut.raw.toNumber()) : new BigNumber(input.inputTokenAmount.raw.toNumber())
      )
    );
  }

  let maxPriorityFee = Math.ceil(Number.parseFloat(String(input.customPriorityFee)) * 1e9);
  innerTransactions[0].instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: maxPriorityFee }));

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

  return await optimizedSendAndConfirmTransaction(
    vTxx,
    connection,
    (await connection.getLatestBlockhash()).blockhash,
    50 // RETRY INTERVAL
  )
  return null;
}