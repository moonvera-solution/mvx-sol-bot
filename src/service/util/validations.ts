import { Connection } from "@solana/web3.js";
import { getSolBalance } from ".";
import { PublicKey } from "@metaplex-foundation/js";
import { MVXBOT_FEES } from "../../../config";


export async function isString(ctx: any, data: any) {
  if (!String(data).match(/^[A-Za-z0-9\s-:]+$/)) {
    await ctx.api.sendMessage(ctx.chat.id, `🔴 Invalid Data. Please enter a valid data`);
    return false;
  } else return true;
}

export async function isNumber(ctx: any, data: any) {
  if (isNaN(data) || data <= 0 || !String(data).match(/^\d+(\.\d+)?$/)) {
    await ctx.api.sendMessage(ctx.chat.id, `🔴 Invalid Data. Please enter a valid amount number`);
    return false;
  } else return true;
}

export async function isPercentage(ctx: any, data: any) {
  if (!await isNumber(ctx, data)) return false;
  if (data <= 0 || data > 100) {
    await ctx.api.sendMessage(
      ctx.chat.id,
      "🔴 Invalid amount. Please enter a number between 0 and 100 to represent the percentage."
    );
    return false;
  } else return true;
}

export async function isToken(ctx: any, address: PublicKey) {
  const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
  const publicKey = new PublicKey(address);
  const TOKEN_PROGRAM_ID = new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  );

  try {
    const accountInfo = await connection.getAccountInfo(publicKey);
    if (accountInfo) {
      return accountInfo.owner.equals(TOKEN_PROGRAM_ID);
    } else {
      // console.log("Invalid token address.");
      await ctx.api.sendMessage(ctx.chat.id, `🔴 Invalid token address. Please enter a valid token address`);
      return false;
    }
  } catch (error) {
    console.error("Error in fetching account info:", error);
    return false;
  }
}

export async function hasEnoughSol(ctx: any, amount: number) {
  if (!await isNumber(ctx, amount)) return false;
  const tokenDecimals = ctx.session.swaptypeDex == 'pump_swap' ? 1 : 1e9;
  const amountIn = amount * tokenDecimals;

  const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
  const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
  let userSolBalance = (await getSolBalance(userWallet.publicKey, connection) * tokenDecimals);

  const botFee = amountIn * MVXBOT_FEES.toNumber();
  const priorityFee = ctx.session.customPriorityFee * tokenDecimals;
  const slippage = amountIn * ctx.session.latestSlippage / 100;
  const finalAmount = amountIn + botFee + priorityFee + slippage;

  if (userSolBalance < amountIn) {
    await ctx.api.sendMessage(ctx.chat.id, `🔴 Insufficient balance. Your balance is <b>${(userSolBalance / tokenDecimals)} SOL</b>`, { parse_mode: 'HTML' });
    return false;
  } else if (userSolBalance < finalAmount) {
    await ctx.api.sendMessage(ctx.chat.id, `🔴 Not enough balance for transaction fees. Always keep enough SOL in your wallet for transaction fees`);
    return false;
  } else return true;
}

export async function hasEnoughToken(ctx: any, token: any, amount: number) {
  const userTokenBalance = token.userTokenBalance;
  const userTokenSymbol = token.userTokenSymbol;
  const tokenDecimals = ctx.session.swaptypeDex == 'pump_swap' ? 1 : token.decimals;
  const amountOut = amount * Math.pow(10, tokenDecimals);

  if (userTokenBalance <= 0) {
    await ctx.api.sendMessage(
      ctx.chat.id,
      `🔴 You have <b>${userTokenBalance} ${userTokenSymbol}</b>`,
      { parse_mode: 'HTML' }
    );
    return false;
  }

  if (!await isNumber(ctx, amount)) return false;

  // console.log('userTokenBalance: ', userTokenBalance);
  // console.log('amountOut: ', amountOut);

  if (userTokenBalance < amountOut) {
    await ctx.api.sendMessage(
      ctx.chat.id,
      `🔴 Insufficient balance. Your balance is <b>${userTokenBalance} ${userTokenSymbol}</b>`,
      { parse_mode: 'HTML' }
    );

    return false;
  } else return true;
}