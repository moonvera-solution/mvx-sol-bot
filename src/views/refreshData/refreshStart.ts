import { getSolBalance } from '../../service/util';
import { getSolanaDetails,  } from '../../api';
import { Connection } from '@solana/web3.js';

export async function handleRefreshStart(ctx: any) {
    const chatId = ctx.chat.id;
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
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
    const welcomeMessage = `✨ Welcome to <b>DRIBs bot</b>✨\n` +
    `Begin by extracting your wallet's private key. Then, you're all set to start trading!\n` +
    `Choose from two wallets: start with the default one or import yours using the "Import Wallet" button.\n` +
    // `We're always working to bring you new features - stay tuned!\n\n` +
    `Your Wallet: <code><b>${publicKeyString}</b></code>\n` +
    `Balance: <b>${balanceInSOL.toFixed(4)}</b> SOL | <b>${(balanceInUSD).toFixed(4)}</b> USD\n\n` +
    `🖐🏼 For security, we recommend exporting your private key and keeping it paper.\n` +
    `<i> Currently DRIBs bot supports Jupiter, Raydium and Pump fun.</i>\n` ;

 // Define the inline keyboard options
 const options: any = {
    reply_markup: JSON.stringify({
        inline_keyboard: [
            // [
            //     { text: '🌎 Website', url: 'https://moonvera.io/' },
            //     { text: '𝚇', url: 'https://twitter.com/moonvera_' }

            // ],
            [{ text: '⬇️ Import Wallet', callback_data: 'import_wallet' }, { text: '💼 Wallets & Settings⚙️', callback_data: 'show_wallets' }],
            [{ text: "☑️ Rug Check", callback_data: "rug_check" }],
            [{ text: "💱 Trade", callback_data: "jupiter_swap" },{ text: "🎯 Turbo Snipe", callback_data: "snipe" }],
            // [{ text: '💱 Buy', callback_data: 'buy' }, { text: 'Sell 📈', callback_data: 'sell' }],
            [{ text: 'ℹ️ Help', callback_data: 'help' }, { text: 'Refer Friends', callback_data: 'refer_friends' }],
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

