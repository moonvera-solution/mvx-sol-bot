import { ray_cpmm_swap } from "../../views/raydium/swapCpmmView";
import { jupiterSwap, swap_pump_fun } from "../../views";
import {verify_position_dex} from "../../views/util/verifySwapDex";
import { getAmmV4PoolKeys, getRayPoolKeys } from "../dex/raydium/utils/formatAmmKeysById";
import { handle_radyum_swap } from "../portfolio/strategies/swaps";
import { PublicKey } from "@solana/web3.js";
import { swap_cpmm_sell } from "../dex/raydium/cpmm/cpmmSell";

export async function handle_buy_swap_routing(ctx: any) {
  const isOnJupiter = await verify_position_dex(ctx, ctx.session.jupSwap_token);
  if (isOnJupiter) {
    console.log("Route Buy to Jupiter Swap");
    if (ctx.session.jupSwap_amount <= 0) {
      await ctx.api.sendMessage(ctx.chat.id, `❌ Please enter an amount greater than 0`);
      return;
    }
    await jupiterSwap(ctx);   
    return;
  } else{
    if (ctx.session.jupSwap_amount <= 0) {
      await ctx.api.sendMessage(ctx.chat.id, `❌ Please enter an amount greater than 0`);
      return;
    }
    ctx.session.pumpToken = new PublicKey(ctx.session.jupSwap_token);
    ctx.session.pump_amountIn = ctx.session.jupSwap_amount;
    ctx.session.pump_side = "buy";
    await swap_pump_fun(ctx);
  }
}

export async function handle_sell_swap_routing(ctx: any) {
    const isOnJupiter = await verify_position_dex(ctx, ctx.session.jupSwap_token);
    if (isOnJupiter) {
      console.log("Route Sell Jupiter Swap");
      ctx.session.jupSwap_amount =  ctx.session.jupSwap_amount ;
      ctx.session.jupSwap_token = ctx.session.jupSwap_token;
      ctx.session.jupSwap_side = "sell";
      await jupiterSwap(ctx);   
      return;
    } else{
      ctx.session.pumpToken = new PublicKey(ctx.session.jupSwap_token);
      ctx.session.pump_amountIn = ctx.session.jupSwap_amount;
      ctx.session.pump_side = "sell";
      await swap_pump_fun(ctx);

    }
  }