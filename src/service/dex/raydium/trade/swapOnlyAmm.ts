const WebSocket = require("ws");
import assert from "assert";

import {
  jsonInfo2PoolKeys,
  Liquidity,
  LiquidityPoolKeys,
  Percent,
  Token,
  TOKEN_PROGRAM_ID,
  TokenAmount,
} from "@raydium-io/raydium-sdk";
import {
  MARKET_STATE_LAYOUT_V3,
  SPL_ACCOUNT_LAYOUT,
  InnerSimpleV0Transaction,
  buildTransaction,
  LiquidityPoolKeysV4,
  TokenAccount,
  BigNumberish,
  Market,
  SPL_MINT_LAYOUT,
  TxVersion,
  buildSimpleTransaction,
  LOOKUP_TABLE_CACHE,
} from "@raydium-io/raydium-sdk";
import BigNumber from "bignumber.js";
import {
  Connection,
  SendOptions,
  Signer,
  Transaction,
  sendAndConfirmTransaction,
  Commitment,
  SystemProgram,
  ConfirmOptions,
} from "@solana/web3.js";

import { getUserTokenBalanceAndDetails } from "../../../feeds";
import {
  Keypair,
  VersionedTransaction,
  TransactionMessage,
  PublicKey,
} from "@solana/web3.js";
import base58 from "bs58";
import {
  connection,
  DEFAULT_TOKEN,
  makeTxVersion,
  MVXBOT_FEES,
  TIP_VALIDATOR,
  WALLET_MVX
} from "../../../../../config";

import { formatAmmKeysById } from "../raydium-utils/formatAmmKeysById";

import {
  buildAndSendTx,
  getWalletTokenAccount,
  buildTx,
  sendTx,
} from "../../../util";

type WalletTokenAccounts = Awaited<ReturnType<typeof getWalletTokenAccount>>;

export type TxInputInfo = {
  ctx: any;
  refferalFeePay:BigNumber;
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
 

  // -------- pre-action: get pool info --------
  const targetPoolInfo = await formatAmmKeysById(input.targetPool);
  assert(targetPoolInfo, "cannot find the target pool");
  const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys;
  // -------- step 1: coumpute amount out --------
  const { amountOut, minAmountOut } = Liquidity.computeAmountOut({
    poolKeys: poolKeys,
    poolInfo: await Liquidity.fetchInfo({ connection, poolKeys }),
    amountIn: input.inputTokenAmount,
    currencyOut: input.outputToken,
    slippage: input.slippage,
  });
  // -------- step 2: create instructions by SDK function --------
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
    computeBudgetConfig: {
      units: 800_000,
      microLamports: 2000000,
    },
  });

  // In case of having a referral
  if (input.refferalFeePay.gt(0) || input.ctx.session.referralCommision > 0) {
    if (input.side === "sell"){
     
      const referralFee = input.ctx.session.referralCommision / 100;

      const bot_fee = new BigNumber(amountOut.raw).multipliedBy(MVXBOT_FEES);
      const referralAmmount = (bot_fee.multipliedBy(referralFee));
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
    if (input.side === "sell"){


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
    // innerTransactions[0].instructions.push(mvxFeeInx);
  }

  return {
    txids: await buildAndSendTx(
      input.wallet,
      innerTransactions,
      input.commitment
    ),
  };
}

export async function getSwapOnlyAmmInstruction(input: TxInputInfo) {
  // -------- pre-action: get pool info --------
  const targetPoolInfo = await formatAmmKeysById(input.targetPool);
  assert(targetPoolInfo, "cannot find the target pool");
  const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys;

  // -------- step 1: coumpute amount out --------
  const { amountOut, minAmountOut } = Liquidity.computeAmountOut({
    poolKeys: poolKeys,
    poolInfo: await Liquidity.fetchInfo({ connection, poolKeys }),
    amountIn: input.inputTokenAmount,
    currencyOut: input.outputToken,
    slippage: input.slippage,
  });

  // -------- step 2: create instructions by SDK function --------
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
  });
  // console.log(
  //   "amountOut:",
  //   amountOut.toFixed(),
  //   "  minAmountOut: ",
  //   minAmountOut.toFixed()
  // );

  return innerTransactions;
}

// async function _stopLoss() {
//   /*
//     base AA3CTyqn3EFYDxiayChLWXdYompiwRJeLqZG589PSvpB
//     quote So11111111111111111111111111111111111111112
//     poolId EmiVJ4eqEWKsa5jjWt3DnPJqyv6mpggiZamDxPyXw4dC
//     decimals 9
//   */

//   const SHITCOIN = new PublicKey('AA3CTyqn3EFYDxiayChLWXdYompiwRJeLqZG589PSvpB');
//   const SHITCOIN_POOL = new PublicKey('EmiVJ4eqEWKsa5jjWt3DnPJqyv6mpggiZamDxPyXw4dC');
//   const SHITCOIN_DECIMALS = 9;
//   const SHITCOIN_AMOUNT = 3970523064630041;

//   const userWallet = Keypair.fromSecretKey(base58.decode(String('2jaFhsbZMy8n7HzMAKrVYADqi5cYhKca7fWpet1gKGtb8X4EW7k1ZqpX7Qdr5NAaV4wTEK6L2mHvEFNaPg7sFR9L')));
//   const inputToken = new Token(TOKEN_PROGRAM_ID, SHITCOIN, SHITCOIN_DECIMALS, '', '');
//   let { userTokenBalance, decimals, userTokenSymbol } = await getUserTokenBalanceAndDetails(userWallet.publicKey, SHITCOIN);

//   const outputToken = DEFAULT_TOKEN.WSOL // RAY
//   const inputTokenAmount = new TokenAmount(inputToken, SHITCOIN_AMOUNT, true)
//   const slippage = new Percent(20, 100)
//   const walletTokenAccounts = await getWalletTokenAccount(connection, userWallet.publicKey)
//   const commitment: Commitment = "processed";

//   const confirmOptions = {
//     /** disable transaction verification step */
//     skipPreflight: false,
//     /** desired commitment level */
//     commitment: commitment,
//     /** preflight commitment level */
//     preflightCommitment: commitment,
//     /** Maximum number of times for the RPC node to retry sending the transaction to the leader. */
//     maxRetries: 10,
//     /** The minimum slot that the request can be evaluated at */
//     // minContextSlot?: number;
//   };
//   swapOnlyAmm({
//     outputToken: outputToken,
//     targetPool: SHITCOIN_POOL.toBase58(),
//     inputTokenAmount: inputTokenAmount,
//     slippage: slippage,
//     walletTokenAccounts: walletTokenAccounts,
//     wallet: userWallet,
//     priorityFee: 5_000,
//     confirmOptions
//   }).then((txid) => {
//     /** continue with txids */
//     console.log("tx: ", txid);
//   })
// }

// _stopLoss();
