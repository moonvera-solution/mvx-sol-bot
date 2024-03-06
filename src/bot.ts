import { createUserPortfolio, createNewWallet, handleGetPrivateKey, checkWalletsLength, confirmResetWalletAgain, resetWallet } from './service/portfolio/wallets';
import { handle_radyum_swap } from './service/portfolio/strategies/swaps';
import { Bot, Context, GrammyError, HttpError, session, SessionFlavor } from "grammy";
import { InlineKeyboardMarkup } from 'node-telegram-bot-api';
import { importWallet, getPortfolio } from './service/portfolio/wallets';
import { ISESSION_DATA, PORTFOLIO_TYPE, RAYDIUM_POOL_TYPE, DefaultSessionData, DEFAULT_PUBLIC_KEY, DefaultPortfolioData } from './service/util/types';
import { Keypair, PublicKey } from '@solana/web3.js';
import { _initDbConnection,_findSOLPoolByBaseMint } from "./db/mongo/crud";
import { handleSettings } from './service/settings';
import { getSolanaDetails } from './api';

import { setSnipe } from './service/portfolio/strategies/snipper';
// import {rugCheck} from './service/rugCheck';
import { display_token_details, display_snipe_options, handleCloseKeyboard } from './views';
import dotenv from 'dotenv';
import { getSolBalance } from './service/util';
import { handleRefreshStart, handleRereshWallet } from './views/refreshData/refreshStart';
import { refreshTokenDetails } from './views/refreshData/refreshBuy';
import { handleWallets } from './views/util/dbWallet';
import { getPoolToken_details, quoteToken } from './views/util/dataCalculation';
import { _getReservers } from './service/dex/raydium/market-data/2_Strategy';
import { RefreshAllWallets } from './views/refreshData/RefresHandleWallets';
import { getRayPoolKeys } from './service/dex/raydium/market-data/1_Geyser';

dotenv.config();

type MyContext = Context & SessionFlavor<ISESSION_DATA>;
export const bot = new Bot<MyContext>(process.env.TELEGRAM_BOT_TOKEN!);
bot.use(session({
    initial: () => (DefaultSessionData)
}));

bot.start();
// /********** INIT DB CONNECTION ***** */
_initDbConnection();

bot.command("start", async (ctx: any) => {
    const chatId = ctx.chat.id;
    ctx.session.latestCommand = "start";
    let userWallet: Keypair | null = null;
    const portfolio: PORTFOLIO_TYPE = await getPortfolio(chatId); // returns portfolio from db if true
    if (portfolio !== DefaultPortfolioData) {
        ctx.session.portfolio = portfolio;
    } else {
        // at this point wallet from session is not avialable yet
        // hence we do ctx.session.portfolio = await getPortfolio(chatId); at the end of the "start" function.
        userWallet = await createUserPortfolio(ctx); // => { publicKey, secretKey }
    }

    // Retrieve the current SOL details
    let solPriceMessage = '';
    const details = await getSolanaDetails();
    const publicKeyString: PublicKey | String = userWallet ? userWallet.publicKey :
        ctx.session.portfolio.wallets[ctx.session.activeWalletIndex].publicKey;

    // Fetch SOL balance
    const balanceInSOL = await getSolBalance(publicKeyString);
    if (balanceInSOL === null) {
        await ctx.api.sendMessage(chatId, "Error fetching wallet balance.");
        return;
    }

    // solana price 
    if (details) {
        const solData = details.toFixed(2);
        solPriceMessage = `\n\$SOL Price: <b>${solData}</b> $USD`;
    } else {
        solPriceMessage = '\nError fetching current SOL price.';
    }

    // Combine the welcome message, SOL price message, and instruction to create a wallet
    const welcomeMessage = ` 🌕 Welcome to Moonvera trading bot. A limit order feature is supported for advanced traders.\n` +
        `${solPriceMessage} \n\n` +
        `Your Wallet:  ` +
        `<code><b>${publicKeyString}</b></code>\n` +
        `Balance: ` +
        `<b>${balanceInSOL.toFixed(4)}</b> $SOL | <b>${(balanceInSOL * details).toFixed(2)}</b> $USD\n\n` +
        '🆘 It is highly recommended to export your private key and import it into a wallet like Phantom';


    // Set the options for th e inline keyboard with social links
    const options: any = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [
                    { text: '🌎 Website', url: 'https://solscifi.com/' },
                    { text: '𝚇', url: 'https://twitter.com/Solfi_SciFi' },
                    { text: '🧑🏽‍💻 Telegram', url: 'https://t.me/solscifi' }
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
    // Send the message with the inline keyboard
    bot.api.sendMessage(chatId, ` ${welcomeMessage}`, options);
    ctx.session.portfolio = await getPortfolio(chatId);
});

bot.command("ctx", async (ctx) => {
    console.log('ctx', ctx.chat.id);
    console.log('ctx', ctx.session.portfolio);
    console.log('ctx', ctx.session);
    console.log('ctx', ctx.msg.message_id)
});

// bot.command("createwallet", async (ctx) => {
//     const chatId = ctx.chat.id;
//     try {
//         createNewWallet(ctx);
//     } catch (error: any) {
//         console.error('Error creating Solana wallet:', error.message);
//         await bot.api.sendMessage(chatId, 'Error creating wallet. Please try again.');
//     }
// });

bot.on('message', async (ctx) => {
    // console.log('latestCommand-----', ctx.session.latestCommand);
    try {
        const chatId = ctx.chat.id;
        const latestCommand = ctx.session.latestCommand;
        const msgTxt = ctx.update.message.text;

        // console.log('latestCmd-----', latestCmd);

        switch (latestCommand) {
            case 'set_slippage': {
                ctx.session.latestSlippage = Number(msgTxt);
                await handleSettings(ctx);
                break;
            }
            case 'buy_X_SOL': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint,'buy', Number(msgTxt)); break;
            case 'sell_X_TOKEN': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'sell', Number(msgTxt)); break;
            case 'snipe_X_SOL': await setSnipe(ctx, Number(msgTxt)); break;
            case 'import_wallet': {
                if (ctx.session.latestCommand === 'import_wallet') {
                  const walletImportResult = await importWallet(ctx, String(msgTxt));
                  
                  if (walletImportResult.status === "success") {
                    await bot.api.sendMessage(chatId, "Wallet imported successfully.");
                  } else if (walletImportResult.status === "wallet_exists") {
                    await bot.api.sendMessage(chatId, "Wallet already exists.");
                  } else if (walletImportResult.status === "error") {
                    await bot.api.sendMessage(chatId, `Error: ${walletImportResult.message}`);
                  }
                }
                break;
              }
              
                // const secretKey = msgTxt ?? '';
                // const allowed = await checkWalletsLength(ctx);
                // if (allowed) {
                //     await ctx.api.sendMessage(chatId, "Please enter your private/secret key.");
                //     if (secretKey){
                //         await importWallet(ctx, secretKey);
                //     }
                   
                // } else{
                //     await ctx.api.sendMessage(chatId, "You have reached the maximum number of wallets allowed.");
                // }
           
                case 'sell': {
                    if (PublicKey.isOnCurve(msgTxt!)) {
                        if (msgTxt) {
                            ctx.session.activeTradingPool = await getRayPoolKeys(msgTxt)
             
                       
                            await display_token_details(ctx);
                        }
                    } else {
                        bot.api.sendMessage(chatId, "Invalid address");
                    }
                    break;
                }
            case 'buy': {
                if (PublicKey.isOnCurve(msgTxt!)) {
                    if (msgTxt) {
                        ctx.session.activeTradingPool = await getRayPoolKeys(msgTxt)
             
                       
                        await display_token_details(ctx);
                    }
                } else {
                    bot.api.sendMessage(chatId, "Invalid address");
                }
                break;
            }
            case 'snipe': {
                if (PublicKey.isOnCurve(msgTxt!)) {
                    ctx.session.snipeToken = new PublicKey(msgTxt!);
                    display_snipe_options(ctx);
                } else {
                    bot.api.sendMessage(chatId, "Invalid address");
                }
            }
        }
    } catch (e: any) {
        console.error("ERROR on bot.on txt msg", e);
    }
});

bot.on('callback_query', async (ctx: any) => {
    // console.log('latestCommand-----', ctx.session.latestCommand);

    const chatId = ctx.chat.id;
    const data = ctx.callbackQuery.data;
    try {
        switch (data) { // make sure theres a "break" after each statement...
            case 'refresh_start': await handleRefreshStart(ctx);
                break;
            case 'select_wallet_0':
                    // console.log(data);
                    ctx.session.activeWalletIndex = 0;
                    await handleSettings(ctx);
                    break;
            case 'select_wallet_1':
                        // console.log(data);
                        ctx.session.activeWalletIndex = 1;
                        await handleSettings(ctx);
                        break;
            case 'refresh_wallet': await handleRereshWallet(ctx);
                break;
            case 'show_wallets': await handleWallets(ctx);
                break;
            case 'refresh_db_wallets': await RefreshAllWallets(ctx);
                break;
            // case 'refresh_trade':
            //     const tokenAddress = ctx.session.activeTradingPool.baseMint;
            //     if (tokenAddress != DEFAULT_PUBLIC_KEY) {
            //         ctx.session.activeTradingPool = await getPoolDetails(tokenAddress);
            //         const speficiPool = ctx.session.activeTradingPool
            //         await refreshTokenDetails(ctx, speficiPool);
            //         break;
            //     }
            case 'delete_wallet': {
                await resetWallet(ctx);
                break;
            }
            case 'refresh_wallet': await handleRereshWallet(ctx); break;
            case 'show_wallets': await handleWallets(ctx); break;
            case 'refresh_trade': await refreshTokenDetails(ctx); break;
            case 'delete_wallet': await resetWallet(ctx); break;
            case 'import_wallet': {
                ctx.session.latestCommand = 'import_wallet';
                const allowed = await checkWalletsLength(ctx);
                if (allowed) {
                    await ctx.api.sendMessage(chatId, "Please enter your private/secret key.");
                }
                break;
            }
            
            case 'rug_check': {
                const tokenAddress = ctx.session.latestTokenAddress;
                if (tokenAddress) {
                    // await rugCheck(chatId, tokenAddress);
                } else {
                    await bot.api.sendMessage(chatId, "Enter the token Address you would like to check.");
                }
                break;
            }
            case 'refresh_rug': {
                const tokenAddress = ctx.session.activeTradingPool.baseMint;
                if (tokenAddress != DEFAULT_PUBLIC_KEY) {
                    ctx.session.latestCommand = 'refresh_rug';
                    // await rugCheck(chatId, tokenAddress, messageId)
                }
                break;
            }
            case 'create_new_wallet': 
            const allowed = await checkWalletsLength(ctx);

            if(allowed){
                await createNewWallet(ctx);
        }
          
             break;
            case 'settings': await handleSettings(ctx); break;
            case 'get_private_key': await handleGetPrivateKey(ctx); break;
            case 'cancel_reset_wallet': await handleCloseKeyboard(ctx); break;
            case 'confirm_reset_wallet': await confirmResetWalletAgain(ctx); break;
            case 'closing': await handleCloseKeyboard(ctx); break;
           
            case 'sell': {
                const sellToken = ctx.session.sellToken;
                ctx.session.latestCommand = 'sell';
                if (sellToken != DEFAULT_PUBLIC_KEY) {
                    ctx.session.activeTradingPool = await getRayPoolKeys(sellToken.toBase58())
                    await display_token_details(ctx);
                } else {
                    await bot.api.sendMessage(chatId, "Enter the token Address you would like to sell.");
                }
                break;
            }
            case 'buy': {
                const buyToken = ctx.session.buyToken;
                ctx.session.latestCommand = 'buy';
                if (buyToken != DEFAULT_PUBLIC_KEY) {
                    ctx.session.activeTradingPool = await getRayPoolKeys(buyToken.toBase58())

                    await display_token_details(ctx);
                } else {
                    await ctx.api.sendMessage(chatId, "Enter the token Address you would like to Buy.");
                }
                break;
            }
            case 'snipe': {
                const snipeToken = ctx.session.snipeToken;
                ctx.session.latestCommand = 'snipe';
                if (snipeToken == DEFAULT_PUBLIC_KEY) {
                    await bot.api.sendMessage(chatId, "Enter token address to Snipe.");
                } else {
                    await display_snipe_options(ctx);
                }
                break;
            }
            case 'set_slippage': {
                ctx.session.latestCommand = 'set_slippage';
                bot.api.sendMessage(chatId, "Please enter slippage % amount");
                break;
            }
            case 'buy_0.1_SOL': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'buy', '0.1'); break;
            case 'buy_0.2_SOL': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'buy', '0.2'); break;
            case 'buy_0.5_SOL': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'buy', '0.5'); break;
            case 'buy_1_SOL': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'buy', '1'); break;
            case 'buy_5_SOL': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'buy', '5'); break;
            case 'buy_X_SOL': {
                ctx.session.latestCommand = 'buy_X_SOL';
                bot.api.sendMessage(chatId, "Please enter SOL amount");
                break;
            }
            case 'sell_10_TOKEN': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'sell', '10',); break;
            case 'sell_20_TOKEN': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'sell', '20',); break;
            case 'sell_30_TOKEN': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'sell', '30',); break;
            case 'sell_50_TOKEN': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'sell', '50',); break;
            case 'sell_75_TOKEN': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'sell', '75',); break;
            case 'sell_100_TOKEN': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'sell', '100',); break;
            case 'sell_X_TOKEN': {
                ctx.session.latestCommand = 'sell_X_TOKEN';
                bot.api.sendMessage(chatId, "Please enter amount to sell.");
                break;
            }
            case 'snipe_0.1_SOL': await setSnipe(ctx, '0.1'); break;
            case 'snipe_0.2_SOL': await setSnipe(ctx, '0.2'); break;
            case 'snipe_0.5_SOL': await setSnipe(ctx, '0.5'); break;
            case 'snipe_1_SOL': await setSnipe(ctx, '1'); break;
            case 'snipe_5_SOL': await setSnipe(ctx, '5'); break;
            case 'snipe_X_SOL': {
                ctx.session.latestCommand = 'snipe_X_SOL';
                bot.api.sendMessage(chatId, "Please enter amount to snipe.");
                break;
            }
        }
        bot.api.answerCallbackQuery(ctx.callbackQuery.id);
    } catch (e: any) {
        console.error(e.message);
        console.error(e);
    }
});

bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);
    const e = err.error;
    if (e instanceof GrammyError) {
        console.error("Error in request:", e.description);
    } else if (e instanceof HttpError) {
        console.error("Could not contact Telegram:", e);
    } else {
        console.error("Unknown error:", e);
    }
});







