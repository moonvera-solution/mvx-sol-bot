import { ray_cpmm_swap } from "../../views/raydium/swapCpmmView";
import { jupiterSwap, swap_pump_fun } from "../../views";
import {verify_position_dex} from "../../views/util/verifySwapDex";
import { getAmmV4PoolKeys, getRayPoolKeys } from "../dex/raydium/utils/formatAmmKeysById";
import { handle_radyum_swap } from "../portfolio/strategies/swaps";
import { PublicKey } from "@solana/web3.js";

export async function handle_autoBuy(ctx: any) {
  const isOnJupiter = await verify_position_dex(ctx, ctx.session.autoBuy_token);
  if (isOnJupiter) {
    console.log("Auto Jupiter Swap");
    ctx.session.jupSwap_amount = ctx.session.autobuy_amount;
    ctx.session.jupSwap_token = ctx.session.autoBuy_token;
    ctx.session.jupSwap_side = "buy";
    await jupiterSwap(ctx);   
    return;
  } else{
    ctx.session.activeTradingPoolId = await getRayPoolKeys(ctx, ctx.session.autoBuy_token);
    if (!ctx.session.isCpmmPool) {
      console.log("Auto raydium amm Swap");

    await getAmmV4PoolKeys(ctx);
    await handle_radyum_swap(ctx,  "buy",ctx.session.autobuy_amount);
    return;
    } else if (ctx.session.isCpmmPool) {
      ctx.session.cpmmPoolId = ctx.session.activeTradingPoolId
      if (ctx.session.cpmmPoolId) {
        console.log("Auto raydium CPMMMM Swap");

        ctx.session.cpmm_amountIn = ctx.session.autobuy_amount;
        ctx.session.cpmm_side = "buy";
        await ray_cpmm_swap(ctx);
        return;
      } else{
        console.log("Auto raydium pumFUNN Swap");

        ctx.session.pumpToken = new PublicKey(ctx.session.autoBuy_token);
        ctx.session.pump_amountIn = ctx.session.autobuy_amount;
        ctx.session.pump_side = "buy";
        await swap_pump_fun(ctx);
      }
    }
  }
}
