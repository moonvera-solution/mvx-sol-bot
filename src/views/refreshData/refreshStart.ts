import { getSolBalance } from '../../service/util';
import { getSolanaDetails,  } from '../../api';
import { CONNECTION } from '../../config';

export async function handleRefreshStart(ctx: any) {
    const chatId = ctx.chat.id;
    const connection = CONNECTION;
    let solPriceMessage = '';
    let userWallet: any;
 
    try {
        if(ctx.session.portfolio){
            const selectedWallet = ctx.session.portfolio.activeWalletIndex;
            userWallet = ctx.session.portfolio.wallets[selectedWallet];
        }
        // console.log('userWallet', userWallet)
        const publicKeyString: any = userWallet.publicKey; // The user's public key
        // Fetch SOL balance
        const [balanceInSOL, solanaDetails,jupSolPrice] = await Promise.all([
            getSolBalance(publicKeyString, connection),
            getSolanaDetails(),
            fetch(
                `https://price.jup.ag/v6/price?ids=SOL`
              ).then((response) => response.json())
        ]);  
      
     // Retrieve wallet user and balance in SOL and USD 
 

     if (balanceInSOL === null) {
         await ctx.api.sendMessage(chatId, "Error fetching wallet balance.");
         return;
     }
     const balanceInUSD = solanaDetails ? balanceInSOL * solanaDetails: balanceInSOL * Number(jupSolPrice.data.SOL.price);

    // Update the welcome message with the new SOL price
    const welcomeMessage =
      `<b>✨ DRIBs✨</b>\n` +
      `| <a href="https://www.dribs.io">Website</a> | <a href="https://x.com/dribs_sol"> X </a> | \n\n` +
      `Start by choosing a wallet or import one using the "Import Wallet" button.\n` +
      `Your Wallet: <code><b>${publicKeyString}</b></code>\n` +
      `Balance: <b>${balanceInSOL.toFixed(4)}</b> SOL | <b>${(balanceInUSD.toFixed(4))}</b> USD\n\n` +
      `<i>  - 📣 Limit Order is available</i>\n\n` +
      `<b> Markets </b>\n`+
      `<i>  - Jupiter  </i>\n`+
      `<i>  - Raydium AMM/CPMM </i>\n`+
      `<i>  - Pump fun </i>\n\n`+
      `<i>  - 📢  Dribs Market Maker Bot is available now! 🤖💼
        For more information or to get started, please contact us directly </i>\n`;

 // Define the inline keyboard options
 const options: any = {
    reply_markup: JSON.stringify({
        inline_keyboard: [
            [
                { text: 'Tg official channel', url: 'https://t.me/DRIBs_official' },
            ],
            [{ text: '⬇️ Import Wallet', callback_data: 'import_wallet' }, { text: '💼 Wallets & Settings⚙️', callback_data: 'show_wallets' }],
            [{ text: "☑️ Rug Check", callback_data: "rug_check" }],
            [{ text: "💱 Trade", callback_data: "jupiter_swap" },{ text: "🎯 Turbo Snipe", callback_data: "snipe" }],
            [{ text: "⌚️ Set Limit Orders", callback_data: "limitOrders" },
                { text: "⏳ Open Orders", callback_data: "display_open_orders" }],            [{ text: 'ℹ️ Help', callback_data: 'help' }, { text: 'Refer Friends', callback_data: 'refer_friends' }],
            [{ text: 'Positions', callback_data: 'display_spl_positions' }],
            [{ text: '🔄 Refresh', callback_data: 'refresh_start' }],
           
        ],
    }),
    parse_mode: 'HTML'
};
    // Edit the existing message with the updated information and the inline keyboard
 
        await ctx.editMessageText(welcomeMessage, options);
    } catch (error) {
        console.error("Error updating message: ", error);
    }
}

