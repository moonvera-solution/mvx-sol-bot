import { getSolanaDetails } from '../../api';
import { getSolBalance } from '../util';
import {  CONNECTION } from '../../config';

export async function handleSettings(ctx: any) {
    try { 
    const selectedWallet = ctx.session.portfolio.activeWalletIndex;
    const userWallet = ctx.session.portfolio.wallets[selectedWallet];
    const chatId = ctx.chat.id;
    const publicKeyString: any = userWallet.publicKey; // The user's public key
    const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
    let swapUrlSol = `${rpcUrl}/jupiter/quote?inputMint=${'So11111111111111111111111111111111111111112'}&outputMint=${'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'}&amount=${1000000000}&slippageBps=${0}`.trim();
    
    // Fetch SOL balance
    const connection = CONNECTION;
    const [balanceInSOL, jupSolPrice] = await Promise.all([
        getSolBalance(publicKeyString, connection), 
        fetch(swapUrlSol).then(res => res.json()),
    ]);
   
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
        const balanceInUSD = balanceInSOL * Number(solPrice);

        // Fetch the user's wallet data from the JSON file
        if (!userWallet || !userWallet.publicKey) {
            await ctx.api.sendMessage(chatId, "No wallet found. Please create a wallet first.");
            return;
        }
        // Create a message with the wallet information
        const walletInfoMessage = `Your Wallet:  ` +
            `<code>${publicKeyString}</code>\n` +
            `Balance: ` +
            `<b>${balanceInSOL.toFixed(3)}</b> SOL | <b>${balanceInUSD.toFixed(3)}</b> USD\n`;
        // console.log('autobuy_amount', ctx.session.autobuy_amount)   
        console.log('autobuy', ctx.session.autoBuyActive)
        const autobuy_button = ctx.session.autoBuyActive && ctx.session.autobuy_amount > 0 ? '✅ Auto buy' : '❌ Auto buy';
        const mevProtection_button = ctx.session.mevProtection ? '✅ MEV protection' : '❌ MEV protection';
        // Inline keyboard options
        const options: any = {
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: 'Get Private Key', callback_data: 'get_private_key' }],
                    [{ text: `✏ Slippage (${ctx.session.latestSlippage}%)`, callback_data: 'set_slippage' },{ text: `✏ Priority Fee (${ctx.session.customPriorityFee} SOL)`, callback_data: 'set_customPriority' } ],
                    [{ text:   `${autobuy_button}`, callback_data: 'Auto_buy' }, { text: `Amount ${ctx.session.autobuy_amount} SOL`, callback_data: 'set_autobuy_amount' }],
                    [{ text: `${mevProtection_button}`, callback_data: 'MEV_protection' }, { text: `Tip ${ctx.session.mevProtectionAmount} SOL`, callback_data: 'set_MEV_protection_amount' }],
                    [{ text: '💻 Customize keyboard', callback_data: 'keyboard_custom' }],
                    [{ text: '🔂 Refresh', callback_data: 'refresh_wallet' }, { text: 'Change Wallet', callback_data: 'confirm_reset_wallet' }],
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
