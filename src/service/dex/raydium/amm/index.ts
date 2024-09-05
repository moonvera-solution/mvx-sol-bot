
import assert from "assert";
import {
  _100,
  jsonInfo2PoolKeys,
  Liquidity,
  LiquidityPoolInfo,
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
// import { S } from "@raydium-io/raydium-sdk-v2/lib/api-33b5ab27";
import { Raydium } from "@raydium-io/raydium-sdk-v2";
import { initSdk } from "./AmmPoolData";
import BN from "bn.js";

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
  const connection = input.connection;
  console.log('input:: ', input.targetPool);
  const targetPoolInfo = await formatAmmKeysById(input.targetPool, connection);

  assert(targetPoolInfo, "cannot find the target pool");
  const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys;
  console.log('poolKeys:: hereeee ');
  let minSwapAmountBalance: number = 0;
  /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
  /*                       QUOTE SWAP                           */
  /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-xwxwwx»-»-»-»-»*/


  const raydium = await initSdk( connection)
  raydium.setOwner(input.wallet)

  const data = await raydium.liquidity.getPoolInfoFromRpc({poolId: input.targetPool});
  const rpcData = data.poolRpcData;
  const poolInfo = data.poolInfo;
  const [baseReserve, quoteReserve, status,baseDecimals, quoteDecimal, lpSupply ] = [rpcData.baseReserve, rpcData.quoteReserve, rpcData.status.toNumber(), rpcData.baseDecimal, rpcData.quoteDecimal, poolInfo.lpAmount, poolInfo.openTime ];
  
  const poolUsing: LiquidityPoolInfo = {
    status: new BN(status), // Assuming status is being converted to BN
    baseDecimals: Number(baseDecimals), // Already a number
    quoteDecimals: Number(quoteDecimal), // Already a number
    lpDecimals: 9, // Assuming a standard value for lpDecimals, adjust if necessary
    baseReserve: new BN(baseReserve), // Convert baseReserve to BN
    quoteReserve: new BN(quoteReserve), // Convert quoteReserve to BN
    lpSupply: new BN(lpSupply), // Convert lpSupply to BN
    startTime: new BN(poolInfo.openTime) // Assuming poolInfo.openTime is the start time in a format that can be converted to BN
  };
 
  
    const { amountOut, minAmountOut } = Liquidity.computeAmountOut({
      poolKeys: poolKeys,
      poolInfo: poolUsing,
      amountIn: input.inputTokenAmount,
      currencyOut: input.outputToken,
      slippage: input.slippage,
    });

  /*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-« -«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
  /*                      MAKE RAYIDUM INX                      */
  /*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
  const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
    connection,
    poolKeys,
    userKeys: {
      tokenAccounts: (await getWalletTokenAccount(connection, new PublicKey(input.wallet.publicKey))),
      owner: input.wallet.publicKey,
      payer: input.wallet.publicKey,
    },
    amountIn: input.inputTokenAmount,
    amountOut: minAmountOut,
    fixedSide: "in",
    config: {
      bypassAssociatedCheck: false,
      checkCreateATAOwner: true,
    },
    makeTxVersion,
  })
  let feeAmt = Number.isInteger(amountOut.raw.toNumber()) ? amountOut.raw.toNumber() : Math.ceil(Number.parseFloat(amountOut.raw.toNumber().toFixed(2)));
  // console.log("feeAmt:: ", feeAmt);
  innerTransactions[0].instructions.push(
    ...addMvxFeesInx(
      input.wallet,
      input.side === "sell" ? new BigNumber(feeAmt) : new BigNumber(input.inputTokenAmount.raw.toNumber())
    )
  );
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
  vTxx.message.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  vTxx.sign([input.wallet]);

  return await optimizedSendAndConfirmTransaction(
    vTxx,
    connection,
    vTxx.message.recentBlockhash,
    50 // RETRY INTERVAL
  )

}