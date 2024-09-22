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
    
    await jupiterSwap(ctx);   
    return;
  } else{
    ctx.session.activeTradingPoolId = await getRayPoolKeys(ctx, ctx.session.jupSwap_token);
    if (!ctx.session.isCpmmPool) {
      console.log("Route Buy to raydium amm Swap");
      if (ctx.session.jupSwap_amount <= 0) {
        await ctx.api.sendMessage(ctx.chat.id, `❌ Please enter an amount greater than 0`);
        return;
      }
    await getAmmV4PoolKeys(ctx);
    if (ctx.session.jupSwap_amount <= 0) {
      await ctx.api.sendMessage(ctx.chat.id, `❌ Please enter an amount greater than 0`);
      return;
    }
    await handle_radyum_swap(ctx,  "buy",ctx.session.jupSwap_amount);
    return;
    } else if (ctx.session.isCpmmPool) {
      ctx.session.cpmmPoolId = ctx.session.activeTradingPoolId
      if (ctx.session.cpmmPoolId) {
        console.log("Route Buy to raydium CPMMMM Swap");

        ctx.session.cpmm_amountIn = ctx.session.jupSwap_amount;
        ctx.session.cpmm_side = "buy";
        if (ctx.session.jupSwap_amount <= 0) {
          await ctx.api.sendMessage(ctx.chat.id, `❌ Please enter an amount greater than 0`);
          return;
        }
        await ray_cpmm_swap(ctx);
        return;
      } else{
        console.log("Route Buy to raydium pumFUNN Swap");

        ctx.session.pumpToken = new PublicKey(ctx.session.jupSwap_token);
        ctx.session.pump_amountIn = ctx.session.jupSwap_amount;
        ctx.session.pump_side = "buy";
        if (ctx.session.jupSwap_amount <= 0) {
          await ctx.api.sendMessage(ctx.chat.id, `❌ Please enter an amount greater than 0`);
          return;
        }
        await swap_pump_fun(ctx);
      }
    }
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
      ctx.session.activeTradingPoolId = await getRayPoolKeys(ctx, ctx.session.jupSwap_token);
      if (!ctx.session.isCpmmPool) {
        console.log("Route Sell raydium amm Swap");
  
      await getAmmV4PoolKeys(ctx);
      await handle_radyum_swap(ctx,  "sell",ctx.session.jupSwap_amount);
      return;
      } else if (ctx.session.isCpmmPool) {
        ctx.session.cpmmPoolId = ctx.session.activeTradingPoolId
        if (ctx.session.cpmmPoolId) {
          console.log("Route Sell raydium CPMMMM Swap");
          ctx.session.cpmm_amountIn = ctx.session.jupSwap_amount;
          ctx.session.cpmm_side = "sell";
          await swap_cpmm_sell(ctx);
          return;
        } else{
          console.log("Route Sell raydium pumFUNN Swap");
  
          ctx.session.pumpToken = new PublicKey(ctx.session.jupSwap_token);
          ctx.session.pump_amountIn = ctx.session.jupSwap_amount;
          ctx.session.pump_side = "sell";
          await swap_pump_fun(ctx);
        }
      }
    }
  }