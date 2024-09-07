
import { getSolanaDetails } from '../../api';
import { getSolBalance } from '../util';
import {  CONNECTION } from '../../config';


export async function handleSettings(ctx: any) {
    // await RefreshAllWallets(ctx);
    const selectedWallet = ctx.session.portfolio.activeWalletIndex;
    const userWallet = ctx.session.portfolio.wallets[selectedWallet];
    const chatId = ctx.chat.id;
    const publicKeyString: any = userWallet.publicKey; // The user's public key
    // Fetch SOL balance
    const connection = CONNECTION;
    const [balanceInSOL, solanaDetails] = await Promise.all([getSolBalance(publicKeyString, connection), getSolanaDetails()]);
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
        // console.log('ctx.customPriorityFee', ctx.session.customPriorityFee)
        // Create a message with the wallet information
        const walletInfoMessage = `Your Wallet:  ` +
            `<code>${publicKeyString}</code>\n` +
            `Balance: ` +
            `<b>${balanceInSOL.toFixed(3)}</b> SOL | <b>${balanceInUSD.toFixed(3)}</b> USD\n`;

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
        // Send the wallet information and options to the user
        ctx.api.sendMessage(chatId, walletInfoMessage, options);

    } catch (err) {
        console.error(err);
        console.log("Error fetching wallet balance.");
    }

}
