import { getSolBalance } from '../../service/util';
import { getSolanaDetails,  } from '../../api';
import { Connection } from '@solana/web3.js';

export async function handleRefreshStart(ctx: any) {
    const chatId = ctx.chat.id;
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);

    // Fetch the latest SOL price

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
        const [balanceInSOL, details] = await Promise.all([
            getSolBalance(publicKeyString, connection),
            getSolanaDetails()
        ]);    
        if (details) {
        const solData = details.toFixed(2);
        solPriceMessage = `\n\SOL Price: <b>${solData}</b> USD`;
    } else {
        solPriceMessage = '\nError fetching current SOL price.';
    }
     // Retrieve wallet user and balance in SOL and USD 
 

     if (balanceInSOL === null) {
         await ctx.api.sendMessage(chatId, "Error fetching wallet balance.");
         return;
     }
     const balanceInUSD = (balanceInSOL * (details).toFixed(2));

    // Update the welcome message with the new SOL price
    const welcomeMessage = `✨ Welcome to <b>DRIBs bot</b>✨\n` +
    `Begin by extracting your wallet's private key. Then, you're all set to start trading!\n` +
    `Choose from two wallets: start with the default one or import yours using the "Import Wallet" button.\n` +
    `We're always working to bring you new features - stay tuned!\n\n` +
    `Your Wallet: <code><b>${publicKeyString}</b></code>\n` +
    `Balance: <b>${balanceInSOL.toFixed(4)}</b> SOL | <b>${(balanceInSOL * details).toFixed(4)}</b> USD\n\n` +
    `🖐🏼 For security, we recommend exporting your private key and keeping it paper.`;

 // Define the inline keyboard options
 const options: any = {
    reply_markup: JSON.stringify({
        inline_keyboard: [
            // [
            //     { text: '🌎 Website', url: 'https://moonvera.io/' },
            //     { text: '𝚇', url: 'https://twitter.com/moonvera_' }

            // ],
            [{ text: '⬇️ Import Wallet', callback_data: 'import_wallet' }, { text: '💼 Wallets & Settings⚙️', callback_data: 'show_wallets' }],
            [{ text: "☑️ Rug Check", callback_data: "rug_check" },{ text: "💊 Pump fun", callback_data: "pump_fun" } ],
            [{ text: '🎯 Turbo Snipe', callback_data: 'snipe' }],
            [{ text: '💱 Buy', callback_data: 'buy' }, { text: 'Sell 📈', callback_data: 'sell' }],
            [{ text: 'ℹ️ Help', callback_data: 'help' }, { text: 'Refer Friends', callback_data: 'refer_friends' }],
            [{ text: 'Refresh', callback_data: 'refresh_start' }],
            [{ text: 'Positions', callback_data: 'display_spl_positions' }],
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

export async function handleRereshWallet(ctx: any){

    const chatId = ctx.chat.id;
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
    const selectedWallet = ctx.session.portfolio.activeWalletIndex;
    const userWallet = ctx.session.portfolio.wallets[selectedWallet];

    const publicKeyString: any = userWallet.publicKey; // The user's public key
    const [balanceInSOL, solanaDetails] = await Promise.all([
        getSolBalance(publicKeyString, connection),
        getSolanaDetails()
    ]);
    

    // Fetch SOL balance
    try {
    if (balanceInSOL === null) {
        await ctx.api.sendMessage(chatId, "Error fetching wallet balance.");
        return;
    }

    const balanceInUSD = (balanceInSOL * (solanaDetails));


    // Fetch the user's wallet data from the JSON file
    if (!userWallet || !userWallet.publicKey) {
        await ctx.api.sendMessage(chatId, "No wallet found. Please create a wallet first.");
        return;
    }

    // Create a message with the wallet information
    const updatedWelcomeMessage = `Your Wallet:  ` +
        `<code>${publicKeyString}</code>\n` +
        `Balance: ` +
        `<b>${balanceInSOL.toFixed(3)}</b> SOL | <b>${balanceInUSD.toFixed(2)}</b> USD\n`;

    // Inline keyboard options
    const options: any = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{ text: 'Get Private Key', callback_data: 'get_private_key' }],
                [{ text: `✏ Slippage (${ctx.session.latestSlippage}%)`, callback_data: 'set_slippage' },{ text: `✏ Priority Fee (${ctx.session.customPriorityFee} SOL)`, callback_data: 'set_customPriority' } ],
                [{ text: '🔂 Refresh', callback_data: 'refresh_wallet' }, { text: 'Reset Wallet', callback_data: 'confirm_reset_wallet' }],
                [{ text: '↗️ Send SOL', callback_data: 'send_sol' }],
                [{ text: 'Close', callback_data: 'closing' }]
            ]
        }),
        parse_mode: 'HTML'
    };

 // Edit the existing message with the updated information and the inline keyboard

    await ctx.editMessageText(updatedWelcomeMessage, options);
    ctx.session.latestCommand = "optional";
    } catch (error) {
    console.error("Error updating message: ", error);
    }

}