import { getSolBalance } from '../../service/util';
import { getSolanaDetails,  } from '../../api';
import { CONNECTION } from '../../config';

export async function refreshWallets(ctx: any){
    const chatId = ctx.chat.id;
    const wallets = ctx.session.portfolio.wallets;
    const selectedWalletIndex = ctx.session.portfolio.activeWalletIndex; // Index of the currently selected wallet

    const connection = CONNECTION;

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
    await ctx.editMessageText("Please select a wallet to set your Settings, customize your keyboard, configure slippage & sending SOL:", options);
}

export async function handleRereshWallet(ctx: any){

    const chatId = ctx.chat.id;
    const connection = CONNECTION;
    const selectedWallet = ctx.session.portfolio.activeWalletIndex;
    const userWallet = ctx.session.portfolio.wallets[selectedWallet];

    const publicKeyString: any = userWallet.publicKey; // The user's public key
    const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
    let swapUrlSol = `${rpcUrl}/jupiter/quote?inputMint=${'So11111111111111111111111111111111111111112'}&outputMint=${'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'}&amount=${1000000000}&slippageBps=${0}`.trim();

    const [balanceInSOL, jupSolPrice] = await Promise.all([
        getSolBalance(publicKeyString, connection),
        fetch(swapUrlSol).then(res => res.json())
    ]);
    

    // Fetch SOL balance
    try {
    if (balanceInSOL === null) {
        await ctx.api.sendMessage(chatId, "Error fetching wallet balance.");
        return;
    }
    let solPrice = 0 ;
      
    if(jupSolPrice && jupSolPrice.outAmount){
      solPrice = Number(jupSolPrice.outAmount / 1e6);
      console.log('solPrice from jup:')
    } else {
      await getSolanaDetails().then((data) => {
        solPrice = data;
      });
      console.log('solPrice from birdeye:')
    }
    const balanceInUSD = (balanceInSOL * (solPrice));


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
        const autobuy_button = ctx.session.autoBuyActive ? '✅ Auto buy' : '❌ Auto buy';
        const mevProtection_button = ctx.session.mevProtection ? '✅ MEV protection' : '❌ MEV protection';
    // Inline keyboard options
    const options: any = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{ text: 'Get Private Key', callback_data: 'get_private_key' }],
                [{ text: `✏ Slippage (${ctx.session.latestSlippage}%)`, callback_data: 'set_slippage' },{ text: `✏ Priority Fee (${ctx.session.customPriorityFee} SOL)`, callback_data: 'set_customPriority' } ],
                [{ text: `${autobuy_button}`, callback_data: 'Auto_buy' }, { text: `Amount ${ctx.session.autobuy_amount} SOL`, callback_data: 'set_autobuy_amount' }],
                [{ text: `${mevProtection_button}`, callback_data: 'MEV_protection' }, { text: `Tip ${ctx.session.mevProtectionAmount} SOL`, callback_data: 'set_MEV_protection_amount' }],
                [{ text: '💻 Customize keyboard', callback_data: 'keyboard_custom' }],
                [{ text: '🔂 Refresh', callback_data: 'refresh_wallet' }, { text: 'Change Wallet', callback_data: 'confirm_reset_wallet' }],
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