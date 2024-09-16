import { handleRereshWallet } from "../../views";

export async function set_mevProtection(ctx: any ) {
    ctx.session.mevProtection = true;
    await handleRereshWallet(ctx);
    await ctx.api.sendMessage(ctx.session.chatId, `🟢 MEV protection is enabled`);
    ctx.session.latestCommand = "jupiter_swap";

}

export async function stop_mevProtection(ctx: any ) {
    ctx.session.mevProtection = false;
    await handleRereshWallet(ctx);
    await ctx.api.sendMessage(ctx.session.chatId, `🔴 MEV protection is disabled`);
    ctx.session.latestCommand = "jupiter_swap";

}