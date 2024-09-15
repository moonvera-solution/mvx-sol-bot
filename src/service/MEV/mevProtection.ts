import { handleRereshWallet } from "../../views";

export async function set_MEV_protection(ctx: any ) {
    ctx.session.MEV_protection = true;
    await handleRereshWallet(ctx);
    await ctx.api.sendMessage(ctx.session.chatId, `🟢 MEV protection is enabled`);
    ctx.session.latestCommand = "jupiter_swap";

}

export async function stop_MEV_protection(ctx: any ) {
    ctx.session.MEV_protection = false;
    await handleRereshWallet(ctx);
    await ctx.api.sendMessage(ctx.session.chatId, `🔴 MEV protection is disabled`);
    ctx.session.latestCommand = "jupiter_swap";

}