import { CONNECTION } from "../../config";
import { getSolBalance } from ".";
import { getUserTokenBalanceAndDetails } from "../feeds";
import { PublicKey } from "@solana/web3.js";


export async function isString(ctx: any, data: any) {
  if (!data.match(/^[A-Za-z0-9\s-:]+$/)) {
    await ctx.api.sendMessage(ctx.chat.id, `🔴 Invalid Data. Please enter a valid data`);
    return false;
  } else return true;
}

export async function isNumber(ctx: any, data: any) {
  if (isNaN(data) || data <= 0) {
    await ctx.api.sendMessage(ctx.chat.id, `🔴 Invalid Data. Please enter a valid amount number`);
    return false;
  } else return true;
}

export async function isToken(ctx: any, address: PublicKey) {
  const connection = CONNECTION;
  const publicKey = new PublicKey(address);
  const TOKEN_PROGRAM_ID = new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  );

  try {
    const accountInfo = await connection.getAccountInfo(publicKey);
    if (accountInfo) {
      return accountInfo.owner.equals(TOKEN_PROGRAM_ID);
    } else {
      console.log("Invalid token address.");
      await ctx.api.sendMessage(ctx.chat.id, `🔴 Invalid token address. Please enter a valid token address`);
      return false;
    }
  } catch (error) {
    console.error("Error in fetching account info:", error);
    return false;
  }
}

export async function hasEnoughSol(ctx: any, amount: number) {
  const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
  const connection = CONNECTION;
  let userSolBalance = await getSolBalance(userWallet.publicKey, connection);
  if (userSolBalance < amount) {
    await ctx.api.sendMessage(ctx.chat.id, `🔴 Insufficient balance. Your balance is ${userSolBalance} SOL`);
    return false;
  } else return true;
}

export async function hasEnoughToken(ctx: any, token: PublicKey, amount: any) {
  const connection = CONNECTION;
  const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
  const userTokenBalanceAndDetails = await getUserTokenBalanceAndDetails(userWallet.publicKey, token, connection);
  const userTokenBalance = userTokenBalanceAndDetails.userTokenBalance;
  const userTokenSymbol = userTokenBalanceAndDetails.userTokenSymbol;
  const amountOut = amount * Math.pow(10, userTokenBalanceAndDetails.decimals);

  if (userTokenBalance < amountOut) {
    await ctx.api.sendMessage(
      ctx.chat.id,
      `🔴 Insufficient balance. Your balance is ${userTokenBalance} ${userTokenSymbol}`
    );

    return false;
  } else return true;
}