import { jupiterSwap, swap_pump_fun } from "../../views";
import {verify_position_dex} from "../../views/util/verifySwapDex";

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
    ctx.session.pumpToken = new PublicKey(ctx.session.autoBuy_token);
    ctx.session.pump_amountIn = ctx.session.autobuy_amount;
    ctx.session.pump_side = "buy";
    await swap_pump_fun(ctx);
   
  }
}
