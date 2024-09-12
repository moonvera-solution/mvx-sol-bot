import { handleRereshWallet } from "../../views";


export async function set_auto_buy(ctx: any ) {
    if(ctx.session.autobuy_amount == 0){
        await ctx.api.sendMessage(ctx.session.chatId, `❌ Please set the amount of auto buy first by clicking on the "Amount" button`);
        ctx.session.latestCommand = "jupiter_swap";
        return;
    }
    ctx.session.autoBuyActive = true;
    await handleRereshWallet(ctx);
    await ctx.api.sendMessage(ctx.session.chatId, `🟢 Auto Buy is enabled`);
    ctx.session.latestCommand = "auto_buy_active";

}

export async function stop_auto_buy(ctx: any ) {
    ctx.session.autoBuyActive = false;
    await handleRereshWallet(ctx);
    await ctx.api.sendMessage(ctx.session.chatId, `🔴 Auto Buy is disabled`);
    ctx.session.latestCommand = "jupiter_swap";

}

