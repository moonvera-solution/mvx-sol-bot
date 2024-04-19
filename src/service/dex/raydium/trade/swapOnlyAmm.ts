
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

import { getSimulationComputeUnits } from "@solana-developers/helpers";
import BigNumber from "bignumber.js";
import {
  SystemProgram,
  ComputeBudgetProgram,
  Connection,
} from "@solana/web3.js";
import {
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import base58 from "bs58";
import {
  makeTxVersion,
  MVXBOT_FEES,
  TIP_VALIDATOR,
  WALLET_MVX
} from "../../../../../config";
import { formatAmmKeysById } from "../raydium-utils/formatAmmKeysById";
import { getSimulationUnits, simulateTx, getMaxPrioritizationFeeByPercentile, PriotitizationFeeLevels } from "../../../fees/priorityFees";
import {
  buildAndSendTx,
  getWalletTokenAccount,
  buildTx,
  sendTx,
  getSolBalance
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

export async function swapOnlyAmm(input: TxInputInfo) {
  const connection = new Connection(`${input.ctx.session.env.tritonRPC}${input.ctx.session.env.tritonToken}`);
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

  let maxPriorityFee;
  const raydiumId = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8')
  
  maxPriorityFee = await getMaxPrioritizationFeeByPercentile(connection, {
    lockedWritableAccounts: [
      new PublicKey(poolKeys ? poolKeys.id.toBase58() : raydiumId.toBase58()),
    ], percentile: input.ctx.session.priorityFees, //PriotitizationFeeLevels.LOW,
    fallback: true
  });

  // if (input.ctx.priorityFees == PriotitizationFeeLevels.HIGH) { maxPriorityFee = maxPriorityFee * 3; }
  // if (input.ctx.priorityFees == PriotitizationFeeLevels.MAX) { maxPriorityFee = maxPriorityFee * 1.5; }

  innerTransactions[0].instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: maxPriorityFee }));

  /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
  /*                       Tx Simulation                        */
  /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/

  // 1.-  Simulate the transaction and add the compute unit limit instruction to your transaction
  let units = await getSimulationComputeUnits(connection, innerTransactions[0].instructions, input.wallet.publicKey, []);
  console.log("swap units", units)
  if(units) innerTransactions[0].instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: Math.ceil(units  * 1.1) }));


  // 2.- Circular dependency on units so we need to   simulate again.
  await simulateTx(connection, innerTransactions[0].instructions, input.wallet.publicKey);
  console.log("after simulateTx...");

  return {
    txids: await buildAndSendTx(
      input.wallet,
      innerTransactions,
      connection,
      input.commitment
    ),
  };
}