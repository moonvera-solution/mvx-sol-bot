
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
import { formatAmmKeysById } from "../raydium-utils/formatAmmKeysById";
import { simulateTx, getMaxPrioritizationFeeByPercentile, PriotitizationFeeLevels } from "../../../fees/priorityFees";
import {
  buildAndSendTx,
  getWalletTokenAccount,
  optimizedSendAndConfirmTransaction,
  wrapLegacyTx
} from "../../../util";

type WalletTokenAccounts = Awaited<ReturnType<typeof getWalletTokenAccount>>;

export type TxInputInfo = {
  ctx: any;
  refferalFeePay: BigNumber;
  referralWallet: PublicKey;
  side: "buy" | "sell";
  mvxFee: BigNumber;
  outputToken: Token;
  targetPool: string;
  inputTokenAmount: TokenAmount;
  slippage: Percent;
  walletTokenAccounts: WalletTokenAccounts;
  wallet: Keypair;
  commitment: any;
  skipPreflight: boolean;
  maxRetries: number;
};

export async function swapOnlyAmm(input: TxInputInfo): Promise<string | null> {

  const connection = new Connection(`${input.ctx.session.tritonRPC}${input.ctx.session.tritonToken}`);
  const targetPoolInfo = await formatAmmKeysById(input.targetPool, connection);
  assert(targetPoolInfo, "cannot find the target pool");
  const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys;

  let minSwapAmountBalance: number = 0;

  /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
  /*                       QUOTE SWAP                           */
  /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/

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
      tokenAccounts: input.walletTokenAccounts,
      owner: input.wallet.publicKey,
    },
    amountIn: input.inputTokenAmount,
    amountOut: minAmountOut,
    fixedSide: "in",
    makeTxVersion,
    // computeBudgetConfig: {
    //   units: 500_000,
    //   microLamports: 200000,
    // }, //            
  });


  /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
  /*                      TIP VALIDATOR                         */
  /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/

  // const validatorLead = await connection.getSlotLeader();

  // const transferIx = SystemProgram.transfer({
  //     fromPubkey: input.wallet.publicKey,
  //     toPubkey: new PublicKey(validatorLead),
  //     lamports: TIP_VALIDATOR, // 5_000 || 6_000
  // });

  /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
  /*                      REFERRAL AMOUNT                      */
  /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
  // In case of having a referral
  if (input.refferalFeePay.gt(0) || input.ctx.session.referralCommision > 0) {
    if (input.side === "sell") {

      const referralFee = input.ctx.session.referralCommision / 100;

      const bot_fee = new BigNumber(amountOut.raw.toString()).multipliedBy(MVXBOT_FEES);
      const referralAmmount = bot_fee.multipliedBy(referralFee);
      const cut_bot_fee = bot_fee.minus(referralAmmount);

      input.mvxFee = new BigNumber(Math.ceil(Number(cut_bot_fee)));
      input.refferalFeePay = new BigNumber(Math.ceil(Number(referralAmmount)));
    }

    const mvxFeeInx = SystemProgram.transfer({
      fromPubkey: input.wallet.publicKey,
      toPubkey: new PublicKey(WALLET_MVX),
      lamports: input.mvxFee.toNumber(), // 5_000 || 6_000
    });

    const referralInx = SystemProgram.transfer({
      fromPubkey: input.wallet.publicKey,
      toPubkey: new PublicKey(input.referralWallet),
      lamports: input.refferalFeePay.toNumber(), // 5_000 || 6_000
    });

    innerTransactions[0].instructions.push(mvxFeeInx);
    innerTransactions[0].instructions.push(referralInx);

    minSwapAmountBalance += input.refferalFeePay.toNumber();
    minSwapAmountBalance += input.mvxFee.toNumber();
  } else {
    if (input.side === "sell") {
      const bot_fee = new BigNumber(amountOut.raw.toString()).multipliedBy(MVXBOT_FEES);
      input.mvxFee = new BigNumber(Math.ceil(Number(bot_fee)));
    }
    // buy without referral
    const mvxFeeInx = SystemProgram.transfer({
      fromPubkey: input.wallet.publicKey,
      toPubkey: new PublicKey(WALLET_MVX),
      lamports: input.mvxFee.toNumber(), // 5_000 || 6_000
    });

    innerTransactions[0].instructions.push(mvxFeeInx);
    minSwapAmountBalance += input.mvxFee.toNumber();
  }

  let maxPriorityFee = Math.ceil(Number.parseFloat(input.ctx.session.customPriorityFee) * 1e9);
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
}