import { getSolBalance } from '../../service/util';
import { getSolanaDetails,  } from '../../api';
import { CONNECTION } from '../../config';
import { getWalletNetWorth } from '../../api/priceFeeds/birdEye';

export async function handleRefreshStart(ctx: any) {
  try {
    const chatId = ctx.chat.id;
    const connection = CONNECTION;
    let solPriceMessage = '';
    let userWallet: any;
 

        if(ctx.session.portfolio){
            const selectedWallet = ctx.session.portfolio.activeWalletIndex;
            userWallet = ctx.session.portfolio.wallets[selectedWallet];
        }
        // console.log('userWallet', userWallet)
        const publicKeyString: any = userWallet.publicKey; // The user's public key
        // Fetch SOL balance
        const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
        let swapUrlSol = `${rpcUrl}/jupiter/quote?inputMint=${'So11111111111111111111111111111111111111112'}&outputMint=${'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'}&amount=${1000000000}&slippageBps=${0}`.trim();
    
        const [balanceInSOL,jupSolPrice, networth] = await Promise.all([
          getSolBalance(publicKeyString, connection),
          fetch(swapUrlSol).then(res => res.json()),
            getWalletNetWorth(publicKeyString as string).catch((error) => { console.error("Error fetching net worth: ", error); return null; })
      ]);    
      
     // Retrieve wallet user and balance in SOL and USD 
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

     if (balanceInSOL === null) {
         await ctx.api.sendMessage(chatId, "Error fetching wallet balance.");
         return;
     }
     const balanceInUSD = balanceInSOL * Number(solPrice);
     let networkmessage = '';
     if(networth){
       networkmessage =  `Net Worth: <b>${(Number(networth) /Number(solPrice)).toFixed(4)}</b> SOL | <b>${(Number(networth).toFixed(4))}</b> USD\n\n` ;
     }
    // Update the welcome message with the new SOL price
    const welcomeMessage = 
      `<b>✨ DRIBs ✨</b>\n` +
      `| <a href="https://www.dribs.io">Website</a> | <a href="https://x.com/dribs_sol"> X </a> |\n\n` +
      // `Begin by extracting your wallet's private key. Then, you're all set to start trading!\n` +
      `Start by choosing a wallet or import one using the "Import Wallet" button.\n` +
      `Your Wallet: <code><b>${publicKeyString}</b></code>\n` +
      `Balance: <b>${balanceInSOL.toFixed(4)}</b> SOL | <b>${(balanceInUSD.toFixed(4))}</b> USD\n\n` +
      `${networkmessage}` +
      `<i>  - 📢  Dribs Market Maker Bot is available now! 🤖💼
        For more information or to get started, please contact us directly </i>\n` ;
    



  // Set the options for th e inline keyboard with social links
  const options: any = {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [
            { text: 'Tg official channel', url: 'https://t.me/DRIBs_official' },
        ],
        [
          { text: "⬇️ Import Wallet", callback_data: "import_wallet" },
          { text: "💼 Wallets & Settings⚙️", callback_data: "show_wallets" },
        ],
        [{ text: "☑️ Rug Check", callback_data: "rug_check" }],
        [
          { text: "💱 Trade", callback_data: "jupiter_swap" },
          { text: "🎯 Turbo Snipe", callback_data: "snipe" },
        ],
        [{ text: "⌚️ Set Limit Orders", callback_data: "limitOrders" },
        { text: "⏳ Open Orders", callback_data: "display_open_orders" }],
        [
          { text: "ℹ️ Help", callback_data: "help" },
          // { text: "Refer Friends", callback_data: "refer_friends" },
        ],
        [{ text: "Positions", callback_data: "display_all_positions" }],
        [{text: "🪪 Generate PnL Card", callback_data: "display_pnlcard"},{ text: "🔄 Refresh", callback_data: "refresh_start" }],
        [{ text: "📈 Live chart 📉", url: 'https://t.me/dribs_app_bot/dribs' }],
      ],
    }),
    parse_mode: "HTML",
    disable_web_page_preview: true,

  
};
    // Edit the existing message with the updated information and the inline keyboard
 
        await ctx.editMessageText(welcomeMessage, options);
    } catch (error) {
        console.error("Error updating message: ", error);
    }
}

