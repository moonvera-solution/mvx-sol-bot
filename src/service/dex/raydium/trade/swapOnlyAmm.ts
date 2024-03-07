const WebSocket = require('ws');
import assert from 'assert';

import {
  jsonInfo2PoolKeys,
  Liquidity,
  LiquidityPoolKeys,
  Percent,
  Token, TOKEN_PROGRAM_ID,
  TokenAmount,
} from '@raydium-io/raydium-sdk';
import {
  MARKET_STATE_LAYOUT_V3, SPL_ACCOUNT_LAYOUT, InnerSimpleV0Transaction, buildTransaction,
  LiquidityPoolKeysV4, TokenAccount, BigNumberish,
  Market, SPL_MINT_LAYOUT, TxVersion, buildSimpleTransaction, LOOKUP_TABLE_CACHE,
} from "@raydium-io/raydium-sdk";
import BigNumber from 'bignumber.js';
import {
  Connection, SendOptions,
  Signer,
  Transaction,
  sendAndConfirmTransaction,
  Commitment,
  SystemProgram,
  ConfirmOptions
} from "@solana/web3.js";

import { getUserTokenBalanceAndDetails } from '../../../feeds';
import { Keypair, VersionedTransaction, TransactionMessage, PublicKey } from '@solana/web3.js';
import base58 from "bs58";
import {
  connection,
  DEFAULT_TOKEN,
  makeTxVersion
} from '../../../../../config';

import { formatAmmKeysById } from '../raydium-utils/formatAmmKeysById';

import {
  buildAndSendTx,
  getWalletTokenAccount,
  buildTx,
  sendTx,
} from '../../../util';

type WalletTokenAccounts = Awaited<ReturnType<typeof getWalletTokenAccount>>

export type TxInputInfo = {
  outputToken: Token
  targetPool: string
  inputTokenAmount: TokenAmount
  slippage: Percent
  walletTokenAccounts: WalletTokenAccounts
  wallet: Keypair,
  priorityFee: number,
  confirmOptions: ConfirmOptions
}

export async function swapOnlyAmm(input: TxInputInfo) {
  /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
  /*                         POOL KEYs                          */
  /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
  const targetPoolInfo = await formatAmmKeysById(input.targetPool)
  assert(targetPoolInfo, 'cannot find the target pool')
  const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys;
  const versionnedBundle: VersionedTransaction[] = [];
  const tradeSigner: Keypair[] = [input.wallet];

  /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
  /*                       SWAP QUOTE                           */
  /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/

  const { amountOut, minAmountOut } = Liquidity.computeAmountOut({
    poolKeys: poolKeys,
    poolInfo: await Liquidity.fetchInfo({ connection, poolKeys }),
    amountIn: input.inputTokenAmount,
    currencyOut: input.outputToken,
    slippage: input.slippage,
  });

  /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
  /*                      PRIORITY FEES                         */
  /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/

  const priorityFeeInx = SystemProgram.transfer({
    fromPubkey: input.wallet.publicKey,
    toPubkey: new PublicKey(await connection.getSlotLeader()),
    lamports: input.priorityFee, // 5_000 || 6_000
  });

  const pfInx = new TransactionMessage({
    payerKey: input.wallet.publicKey,
    recentBlockhash: await connection.getLatestBlockhash().then(res => res.blockhash),
    instructions: [priorityFeeInx]
  }).compileToV0Message();

  const pfInxFees = await connection.getFeeForMessage(pfInx);
  console.log(`Estimated SOL mvxFeeInxMsg cost: ${pfInxFees.value} lamports`);

  const versionedTipTx = new VersionedTransaction(pfInx);
  // versionedTipTx.sign(tradeSigner);
  versionnedBundle.push(versionedTipTx);

  /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
  /*                       SWAP Inx                             */
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
    fixedSide: 'in',
    makeTxVersion,
  });

  const swapInxMsg = new TransactionMessage({
    payerKey: input.wallet.publicKey,
    recentBlockhash: await connection.getLatestBlockhash().then(res => res.blockhash),
    instructions: innerTransactions[0].instructions,
  }).compileToV0Message();

  const swapInxMsgFees = await connection.getFeeForMessage(swapInxMsg);
  console.log(`Estimated SOL mvxFeeInxMsg cost: ${swapInxMsgFees.value} lamports`);

  const swapVerTx = new VersionedTransaction(swapInxMsg);
  // swapVerTx.sign(tradeSigner);
  versionnedBundle.push(swapVerTx);

  /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
  /*                       MVX FEEs                             */
  /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/

  function _getRandomMvxFeeAccount() {
    const mvxBotFeeAccount = [
      'MvXfSe3TeEwsEi731Udae7ecReLQPgrNuKWZzX6RB41', // bot fees 1
      'MVXhzk6mafv4zngNVkEov4YJkGtNa1uDQFq2fRmTRni'  // bot fees 2
    ];
    const index = Math.floor(Math.random() * mvxBotFeeAccount.length);
    return mvxBotFeeAccount[index];
  }

  const mvxFeeInx = SystemProgram.transfer({
    fromPubkey: new PublicKey(_getRandomMvxFeeAccount()),
    toPubkey: new PublicKey(await connection.getSlotLeader()),
    lamports: input.priorityFee, // 5_000 || 6_000
  });

  const mvxFeeInxMsg = new TransactionMessage({
    payerKey: input.wallet.publicKey,
    recentBlockhash: await connection.getLatestBlockhash().then(res => res.blockhash),
    instructions: [mvxFeeInx]
  }).compileToV0Message();

  const mvxFeeVerTx = new VersionedTransaction(mvxFeeInxMsg);
  const mvxFeeInxMsgFees = await connection.getFeeForMessage(mvxFeeInxMsg);
  console.log(`Estimated SOL mvxFeeInxMsg cost: ${mvxFeeInxMsgFees.value} lamports`);

  // swapVerTx.sign(tradeSigner);
  versionnedBundle.push(mvxFeeVerTx);


  // Non version tx
  // transaction.add(...innerTransactions[0].instructions);
  // transaction.add(transferIx);
  // transaction.add(inhouseFee);
  // transaction.add(txMssg);

  console.log('amountOut:', amountOut.toFixed(), '  minAmountOut: ', minAmountOut.toFixed());

  return { txids: await sendTx(connection, input.wallet, versionnedBundle, input.confirmOptions) };
  // return await sendAndConfirmTransaction(connection, transaction, [signer], input.commitment);
  // return { txids: await buildAndSendTx(input.wallet, innerTransactions, input.confirmOptions) }
}

export async function getSwapOnlyAmmInstruction(input: TxInputInfo) {
  // -------- pre-action: get pool info --------
  const targetPoolInfo = await formatAmmKeysById(input.targetPool)
  assert(targetPoolInfo, 'cannot find the target pool')
  const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys

  // -------- step 1: coumpute amount out --------
  const { amountOut, minAmountOut } = Liquidity.computeAmountOut({
    poolKeys: poolKeys,
    poolInfo: await Liquidity.fetchInfo({ connection, poolKeys }),
    amountIn: input.inputTokenAmount,
    currencyOut: input.outputToken,
    slippage: input.slippage,
  })

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
    fixedSide: 'in',
    makeTxVersion,
  });
  console.log('amountOut:', amountOut.toFixed(), '  minAmountOut: ', minAmountOut.toFixed())

  return innerTransactions;
}


async function _stopLoss() {
  /*
    base AA3CTyqn3EFYDxiayChLWXdYompiwRJeLqZG589PSvpB
    quote So11111111111111111111111111111111111111112
    poolId EmiVJ4eqEWKsa5jjWt3DnPJqyv6mpggiZamDxPyXw4dC
    decimals 9
  */


  const SHITCOIN = new PublicKey('AA3CTyqn3EFYDxiayChLWXdYompiwRJeLqZG589PSvpB');
  const SHITCOIN_POOL = new PublicKey('EmiVJ4eqEWKsa5jjWt3DnPJqyv6mpggiZamDxPyXw4dC');
  const SHITCOIN_DECIMALS = 9;
  const SHITCOIN_AMOUNT = 3970523064630041;

  const userWallet = Keypair.fromSecretKey(base58.decode(String('2jaFhsbZMy8n7HzMAKrVYADqi5cYhKca7fWpet1gKGtb8X4EW7k1ZqpX7Qdr5NAaV4wTEK6L2mHvEFNaPg7sFR9L')));
  const inputToken = new Token(TOKEN_PROGRAM_ID, SHITCOIN, SHITCOIN_DECIMALS, '', '');
  let { userTokenBalance, decimals, userTokenSymbol } = await getUserTokenBalanceAndDetails(userWallet.publicKey, SHITCOIN);

  const outputToken = DEFAULT_TOKEN.WSOL // RAY
  const inputTokenAmount = new TokenAmount(inputToken, SHITCOIN_AMOUNT, true)
  const slippage = new Percent(20, 100)
  const walletTokenAccounts = await getWalletTokenAccount(connection, userWallet.publicKey)
  const commitment: Commitment = "processed";

  const confirmOptions = {
    /** disable transaction verification step */
    skipPreflight: false,
    /** desired commitment level */
    commitment: commitment,
    /** preflight commitment level */
    preflightCommitment: commitment,
    /** Maximum number of times for the RPC node to retry sending the transaction to the leader. */
    maxRetries: 10,
    /** The minimum slot that the request can be evaluated at */
    // minContextSlot?: number;
  };
  swapOnlyAmm({
    outputToken: outputToken,
    targetPool: SHITCOIN_POOL.toBase58(),
    inputTokenAmount: inputTokenAmount,
    slippage: slippage,
    walletTokenAccounts: walletTokenAccounts,
    wallet: userWallet,
    priorityFee: 5_000,
    confirmOptions
  }).then((txid) => {
    /** continue with txids */
    console.log("tx: ", txid);
  })
}

// _stopLoss();

