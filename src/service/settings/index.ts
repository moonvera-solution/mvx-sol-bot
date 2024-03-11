
import { RefreshAllWallets } from '../../views/refreshData/RefresHandleWallets';
import { getSolanaDetails } from '../../api';
import { getSolBalance } from '../util';

export async function handleSettings(ctx:any) {
    // await RefreshAllWallets(ctx);
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
    const walletInfoMessage = `Your Wallet:  ` +
        `<code>${publicKeyString}</code>\n` +
        `Balance: ` +
        `<b>${balanceInSOL.toFixed(3)}</b> SOL | <b>${balanceInUSD}</b> USD\n`;

    // Inline keyboard options
    const options: any = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{ text: 'Get Private Key', callback_data: 'get_private_key' }, { text: `✏ Slippage (${ctx.session.latestSlippage}%)`, callback_data: 'set_slippage' }],
                [{ text: '🔂 Refresh', callback_data: 'refresh_wallet' },
                    { text: 'Reset Wallet', callback_data: 'confirm_reset_wallet' }
                    
                ],
                [{ text: 'Close', callback_data: 'closing' }]
            ]
        }),
        parse_mode: 'HTML'
    };

 
    // Send the wallet information and options to the user
    ctx.api.sendMessage(chatId, walletInfoMessage, options);
}
