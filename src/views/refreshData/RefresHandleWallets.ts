import { getSolBalance } from '../../service/util';
import { getSolanaDetails,  } from '../../api';
import { Connection } from '@solana/web3.js';


export async function RefreshAllWallets(ctx: any){
    const chatId = ctx.chat.id;
    const wallets = ctx.session.portfolio.wallets;
    const selectedWalletIndex = ctx.session.portfolio.activeWalletIndex; // Index of the currently selected wallet
    console.log('selectedWalletIndex', selectedWalletIndex)
    console.log('wallets', wallets)
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);


    if (!wallets || wallets.length === 0) {
        await ctx.api.sendMessage(chatId, "No wallets found. Please add a wallet first.");
        return;
    }
    const solanaDetails = await getSolanaDetails();
    let inlineKeyboardRows = [];

    for (const [index, wallet] of wallets.entries()) {
        const balanceInSOL = await getSolBalance(wallet.publicKey,connection);
        const balanceInUSD = balanceInSOL * solanaDetails;

        let walletIdentifier = wallet.publicKey;
        let isSelected = index === selectedWalletIndex; // Check if this wallet is selected

        let walletRow = [
            { 
                text: `${isSelected ? '✅ ' : ''}${index + 1}. ${walletIdentifier}`, 
                callback_data: `select_wallet_${index}`
            },
            { 
                text: `${balanceInSOL.toFixed(4)} SOL`, 
                callback_data: `wallet_balance_${index}`
            },
            { 
                text: `${balanceInUSD.toFixed(2)} USD`, 
                callback_data: `wallet_usd_${index}`
            }
        ];
        inlineKeyboardRows.push(walletRow);
    }

    inlineKeyboardRows.push([{ text: '🔄 Refresh', callback_data: 'refresh_db_wallets' }]);
    inlineKeyboardRows.push([{ text: 'Close', callback_data: 'closing' }]);

    const options = {
        reply_markup: {
            inline_keyboard: inlineKeyboardRows
        },
        parse_mode: 'HTML'
    };
    await ctx.editMessageText("Please select a wallet to configure slippage & sending SOL:", options);
}