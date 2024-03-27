
import assert from "assert";
import {
  jsonInfo2PoolKeys,
  Liquidity,
  LiquidityPoolKeys,
  Percent,
  Token,
  TokenAmount, SPL_ACCOUNT_LAYOUT, InnerSimpleV0Transaction,
  LiquidityPoolKeysV4, TOKEN_PROGRAM_ID
} from "@raydium-io/raydium-sdk";
import BigNumber from "bignumber.js";
import {
  SystemProgram, TransactionMessage,
  ComputeBudgetProgram, TransactionInstruction,
  Connection,
} from "@solana/web3.js";
import {
  Keypair,
  PublicKey,
  ComputeBudgetInstruction
} from "@solana/web3.js";
import base58 from "bs58";
import {
  connection,
  makeTxVersion,
  MVXBOT_FEES,
  TIP_VALIDATOR,
  WALLET_MVX
} from "../../../../../config";

import { formatAmmKeysById } from "../raydium-utils/formatAmmKeysById";
import { getSimulationUnits, getMaxPrioritizationFeeByPercentile, PriotitizationFeeLevels } from "../../../fees/priorityFees";
import {
  buildAndSendTx,
  getWalletTokenAccount,
  buildTx,
  sendTx,
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
};


async function getPoolKeys(ammId: string): Promise<LiquidityPoolKeys> {
  const targetPoolInfo = await formatAmmKeysById(ammId);
  assert(targetPoolInfo, "cannot find the target pool");
  return jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys;
}

export async function swapOnlyAmm(input: TxInputInfo) {
  const poolKeys = await getPoolKeys(input.targetPool);
  // console.log("poolKeys", poolKeys);
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

      const bot_fee = new BigNumber(amountOut.raw).multipliedBy(MVXBOT_FEES);
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
  }
  // In case there is no referral  
  else {
    if (input.side === "sell") {
      const bot_fee = new BigNumber(amountOut.raw).multipliedBy(MVXBOT_FEES);
      input.mvxFee = new BigNumber(Math.ceil(Number(bot_fee)));
    }
    // buy without referral
    const mvxFeeInx = SystemProgram.transfer({
      fromPubkey: input.wallet.publicKey,
      toPubkey: new PublicKey(WALLET_MVX),
      lamports: input.mvxFee.toNumber(), // 5_000 || 6_000
    });
    // innerTransactions[0].instructions.push(transferIx);
    innerTransactions[0].instructions.push(mvxFeeInx);
  }

  const maxPriorityFee = await getMaxPrioritizationFeeByPercentile(connection, {
    lockedWritableAccounts: [
      new PublicKey(poolKeys.id.toBase58()),
    ], percentile: input.ctx.session.priorityFee, //PriotitizationFeeLevels.LOW,
    fallback: true
  } // slotsToReturn?: number
  );
  // console.log("maxPriorityFee", maxPriorityFee);

  const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: maxPriorityFee, });

  // Simulate the transaction and add the compute unit limit instruction to your transaction
  let [units] = await Promise.all([
    getSimulationUnits(connection, innerTransactions[0].instructions, input.wallet.publicKey),
    
  ]);

  if (units) {
    // console.log("units: ", units);
    units = Math.ceil(units * 1.05); // margin of error
    innerTransactions[0].instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units }));
  }

  innerTransactions[0].instructions.push(priorityFeeInstruction);
  // console.log("Inx #", innerTransactions[0].instructions.length);

  return {
    txids: await buildAndSendTx(
      input.wallet,
      innerTransactions,
      input.commitment
    ),
  };
}