import { getSolBalance } from '../../service/util';
import { getSolanaDetails,  } from '../../api';

export async function handleRefreshStart(ctx: any) {
    const chatId = ctx.chat.id;
    // Fetch the latest SOL price
    const details = await getSolanaDetails();
    let solPriceMessage = '';
    let userWallet: any;
    
    if (details) {
        const solData = details.toFixed(2);
        solPriceMessage = `\n\SOL Price: <b>${solData}</b> USD`;
    } else {
        solPriceMessage = '\nError fetching current SOL price.';
    }
     // Retrieve wallet user and balance in SOL and USD 
   if(ctx.session.portfolio){
    const selectedWallet = ctx.session.activeWalletIndex;
    userWallet = ctx.session.portfolio.wallets[selectedWallet];
    }
   const publicKeyString: any = userWallet.publicKey; // The user's public key
     // Fetch SOL balance
     const balanceInSOL = await getSolBalance(publicKeyString);
     if (balanceInSOL === null) {
         await ctx.api.sendMessage(chatId, "Error fetching wallet balance.");
         return;
     }
     const balanceInUSD = (balanceInSOL * (details).toFixed(2));

    // Update the welcome message with the new SOL price
    const updatedWelcomeMessage = ` 🌟 Welcome to SOLFI bot - A Solana Trading Bot! 🌟\n` +
        `To start trading, you can just type the token address you want to trade.\n\n` +
        `A wallet has been created for you. You can import your own wallet by clicking on the "Import Wallet" button below.\n\n` +
        `${solPriceMessage} \n\n` +
        `Your Wallet:  ` +
        `<code><b>${publicKeyString}</b></code>\n` +
        `Balance: ` +
        `<b>${balanceInSOL.toFixed(4)}</b> $SOL | <b>${(balanceInSOL * details).toFixed(2)}</b> $USD\n\n` +
        '🆘 It is highly recommended to export your private key and import it into a wallet like Phantom';

 // Define the inline keyboard options
    const options = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [
                    // { text: '🌎 Website', url: 'https://solscifi.com/' },
                    // { text: '𝚇', url: 'https://twitter.com/Solfi_SciFi' },
                    // { text: '🧑🏽‍💻 Telegram', url: 'https://t.me/solscifi' }
                ],
                [{ text: '⬇️ Import Wallet', callback_data: 'import_wallet' }, { text: '💼 Wallets & Settings⚙️', callback_data: 'show_wallets' }],
                [{ text: '🎯 Turbo Snipe', callback_data: 'snipe' }],
                [{ text: '💱 Buy', callback_data: 'buy' }, { text: 'Sell 📈', callback_data: 'sell' }],
                // [{ text: 'ℹ️ Help', callback_data: 'help' }, { text: 'Refer Friends', callback_data: 'refer_friends' }],
                // [{ text: '🚦 Rug Check', callback_data: 'rug_check' },{ text: 'Limit orders', callback_data: 'limit_order' }]
                [ { text: 'Refresh', callback_data: 'refresh_start' }]
            ],
        }),
        parse_mode: 'HTML'
    };
    // Edit the existing message with the updated information and the inline keyboard
    try {
        await ctx.editMessageText(updatedWelcomeMessage, options);
    } catch (error) {
        console.error("Error updating message: ", error);
    }
}

export async function handleRereshWallet(ctx: any){

    const selectedWallet = ctx.session.activeWalletIndex;
    const userWallet = ctx.session.portfolio.wallets[selectedWallet];
    const chatId = ctx.chat.id;

    const publicKeyString: any = userWallet.publicKey; // The user's public key

    // Fetch SOL balance
    const balanceInSOL = await getSolBalance(publicKeyString);
    if (balanceInSOL === null) {
        await ctx.api.sendMessage(chatId, "Error fetching wallet balance.");
        return;
    }

    const solanaDetails = await getSolanaDetails();
    const balanceInUSD = (balanceInSOL * (solanaDetails)).toFixed(2);


    // Fetch the user's wallet data from the JSON file
    if (!userWallet || !userWallet.publicKey) {
        await ctx.api.sendMessage(chatId, "No wallet found. Please create a wallet first.");
        return;
    }

    // Create a message with the wallet information
    const updatedWelcomeMessage = `Your Wallet:  ` +
        `<code>${publicKeyString}</code>\n` +
        `Balance: ` +
        `<b>${balanceInSOL.toFixed(3)}</b> SOL | <b>${balanceInUSD}</b> USD\n`;

    // Inline keyboard options
    const options: any = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{ text: 'Get Private Key', callback_data: 'get_private_key' }, { text: `✏ Slippage (${ctx.session.latestSlippage}%)`, callback_data: 'set_slippage' }],
                [{ text: '🔂 Refresh', callback_data: 'refresh_wallet' },
                    { text: 'Reset Wallet', callback_data: 'generate_new_wallet' }
                    
                ],
                [{ text: 'Close', callback_data: 'closing' }]
            ]
        }),
        parse_mode: 'HTML'
    };

 // Edit the existing message with the updated information and the inline keyboard
 try {
    await ctx.editMessageText(updatedWelcomeMessage, options);
    } catch (error) {
    console.error("Error updating message: ", error);
    }

}