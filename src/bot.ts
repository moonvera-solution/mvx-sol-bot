import { createUserPortfolio, createNewWallet, handleGetPrivateKey, checkWalletsLength, confirmResetWalletAgain, resetWallet } from './service/portfolio/wallets';
import { handle_radyum_swap } from './service/portfolio/strategies/swaps';
import { Bot, Context, GrammyError, HttpError, session, SessionFlavor } from "grammy";
import { importWallet, getPortfolio } from './service/portfolio/wallets';
import { ISESSION_DATA, DefaultSessionData, DEFAULT_PUBLIC_KEY, DefaultPortfolioData } from './service/util/types';
import { Keypair, PublicKey } from '@solana/web3.js';
import { _initDbConnection } from "./db/mongo/crud";
import { handleSettings } from './service/settings';
import { getSolanaDetails } from './api';
import { setSnipe, snipperON } from './service/portfolio/strategies/snipper';
import { display_token_details, display_snipe_options, handleCloseKeyboard } from './views';
import { getSolBalance, sendSol } from './service/util';
import { handleRefreshStart, handleRereshWallet } from './views/refreshData/refreshStart';
import { refreshTokenDetails } from './views/refreshData/refreshBuy';
import { handleWallets } from './views/util/dbWallet';
import { _getReservers } from './service/dex/raydium/market-data/2_Strategy';
import { RefreshAllWallets } from './views/refreshData/RefresHandleWallets';
import { getRayPoolKeys } from './service/dex/raydium/market-data/1_Geyser';
import { sendHelpMessage, sendReferMessage } from './views/util/helpMessage';
import { display_rugCheck } from './views/rugCheck';
import { Refresh_rugCheck } from './views/refreshData/refreshRug';
import { _generateReferralLink, _getReferralData } from '../src/db/mongo/crud';
import { Referrals } from './db/mongo/schema';
import { display_spl_positions } from './views/portfolioView';
import { refreshSnipeDetails } from './views/refreshData/refereshSnipe';
import { PriotitizationFeeLevels } from "../src/service/fees/priorityFees";
import { refresh_spl_positions } from './views/refreshData/refreshPortfolio';
import { logErrorToFile } from "../error/logger";
import { _loadEnvVars } from "./service/util/loadKeys";
import { loadSecrets } from "./service/util/loadKeys";
const isProd = process.env.NODE_ENV === 'PROD';
type MyContext = Context & SessionFlavor<ISESSION_DATA>;


/*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
/*                  BOT START & SET ENV                       */
/*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/

async function initializeBot() {
    let tg: any = null;
    if (isProd) {
        loadSecrets().then((_anon: any) => {
            console.log("_anon", _anon);
            _initDbConnection(_anon);
            tg = _anon.tg;
            console.log("tg", tg);
            const bot: Bot<MyContext> = new Bot<MyContext>(tg);
            bot.use(session({ initial: () => JSON.parse(JSON.stringify(DefaultSessionData)) }));
            bot.start();
            return bot;
        });
    } else {
        _initDbConnection();
        tg = process.env.TELEGRAM_TOKEN;
        const bot: Bot<MyContext> = new Bot<MyContext>(tg);
        bot.use(session({ initial: () => JSON.parse(JSON.stringify(DefaultSessionData)) }));
        bot.start();
        return bot;
    }
}

initializeBot().then(bot => {
    if (bot) {
        const allowedUsernames = ['tech_01010', 'daniellesifg']; // without the @
        async function _setUpEnv(ctx: any): Promise<any> {
            try {
                const chatId = ctx.chat.id;
                ctx.session.latestCommand = "start";

                // set env vars
                await _loadEnvVars(ctx);

                // set user portfolio
                ctx.session.portfolio = await getPortfolio(chatId) !== DefaultPortfolioData ? await getPortfolio(chatId) : await createUserPortfolio(ctx);

                // set referral
                await _setReferral(ctx, ctx.session.portfolio == DefaultPortfolioData);

            } catch (error: any) {
                console.error('Error in _setUpEnv:', error);
                logErrorToFile('Env SetUp', error);
            }
        }

        async function _setReferral(ctx: any, isNewUser: boolean) {
            let chatId = ctx.chat.id;
            let referralCode = null;
            if (ctx.message.text.includes(' ')) {
                referralCode = ctx.message.text.split(' ')[1];
            }
            if (referralCode) {
                const referralRecord = await Referrals.findOne({ referralCode: referralCode });
                if (referralRecord && referralRecord.generatorChatId !== chatId) {
                    if (!referralRecord.referredUsers.includes(chatId)) {
                        // Add the user's chatId to the referredUsers array
                        referralRecord.referredUsers.push(chatId);

                        // Increment the referral count
                        referralRecord.numberOfReferrals! += 1;
                        await referralRecord.save();
                        ctx.session.generatorWallet = new PublicKey(referralRecord.generatorWallet);
                        ctx.session.referralCommision = referralRecord.commissionPercentage;
                        // ctx.session.referralEarnings = referralRecord.earnings;
                        // Optional: Notify the user that they have been referred successfully
                        await ctx.reply("Welcome! You have been referred successfully.");
                    } else {
                        ctx.session.generatorWallet = referralRecord.generatorWallet;
                        ctx.session.referralCommision = referralRecord.commissionPercentage;
                    }
                } else {
                    // Handle invalid referral code
                    await ctx.api.sendMessage(chatId, "Invalid referral link. Please check your link or contact support.");
                    // return;
                }
            } else if (isNewUser) {
                // New user without a referral code
                await ctx.api.sendMessage(chatId, "Welcome to MVXBOT! Please start the bot using a referral link.");
                return;
            }
        }

        bot.command("start", async (ctx: any) => {
            try {
                await _setUpEnv(ctx);
                const chatId = ctx.chat.id;
                const wIdx = ctx.session.activeWalletIndex;
                const userPk = ctx.session.portfolio.wallets[wIdx].publicKey;
                const publicKeyString = userPk instanceof PublicKey ? userPk.toBase58() : userPk;
                const balanceInSOL = await getSolBalance(publicKeyString);
                if (balanceInSOL === null) {
                    await ctx.api.sendMessage(chatId, "Error fetching wallet balance.");
                    return;
                }
                // SOL price
                let solPriceMessage;
                const details = await getSolanaDetails();
                if (details) {
                    const solData = details.toFixed(2);
                    solPriceMessage = `\n\SOL Price: <b>${solData}</b> USD`;
                } else {
                    solPriceMessage = '\nError fetching current SOL price.';
                }

                // Combine the welcome message, SOL price message, and instruction to create a wallet
                const welcomeMessage = `✨ Welcome to <b>MVXBOT</b> - Your Advanced Trading Companion! ✨\n` +
                    `Begin by extracting your wallet's private key. Then, you're all set to start trading!\n` +
                    `Choose from two wallets: start with the default one or import yours using the "Import Wallet" button.\n` +
                    `We're always working to bring you new features - stay tuned!\n\n` +
                    `Your Wallet: <code><b>${publicKeyString}</b></code>\n` +
                    `Balance: <b>${balanceInSOL.toFixed(4)}</b> SOL | <b>${(balanceInSOL * details).toFixed(2)}</b> USD\n\n` +
                    `🖐🏼 For security, we recommend exporting your private key and keeping it paper.`;

                // Set the options for th e inline keyboard with social links
                const options: any = {
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            // [
                            //     { text: '🌎 Website', url: 'https://moonvera.io/' },
                            //     { text: '𝚇', url: 'https://twitter.com/moonvera_' }

                            // ],
                            [{ text: '⬇️ Import Wallet', callback_data: 'import_wallet' }, { text: '💼 Wallets & Settings⚙️', callback_data: 'show_wallets' }],
                            [{ text: '☑️ Rug Check', callback_data: 'rug_check' }],
                            [{ text: '🎯 Turbo Snipe', callback_data: 'snipe' }],
                            [{ text: '💱 Buy', callback_data: 'buy' }, { text: 'Sell 📈', callback_data: 'sell' }],
                            [{ text: 'ℹ️ Help', callback_data: 'help' }, { text: 'Refer Friends', callback_data: 'refer_friends' }],
                            [{ text: 'Refresh', callback_data: 'refresh_start' }],
                            [{ text: 'Positions', callback_data: 'display_spl_positions' }],
                        ],
                    }),
                    parse_mode: 'HTML'
                };
                // Send the message with the inline keyboard
                ctx.api.sendMessage(chatId, ` ${welcomeMessage}`, options);
                ctx.session.portfolio = await getPortfolio(chatId);

            } catch (error: any) {
                logErrorToFile('bot on start', error);
                console.error('Error:', error);
            }
        });

        bot.command('help', async (ctx) => {
            await sendHelpMessage(ctx);
        });

        bot.command('positions', async (ctx) => {
            await display_spl_positions(ctx);
        });

        bot.command('rugchecking', async (ctx) => {
            await ctx.api.sendMessage(ctx.chat.id, "Please provide the token address for a rug pull analysis.");
            ctx.session.latestCommand = 'rug_check';

        })
        bot.command('buy', async (ctx) => {
            const chatId = ctx.chat.id;
            const referralRecord = await Referrals.findOne({ referredUsers: chatId });
            if (referralRecord) {
                ctx.session.referralCommision = referralRecord.commissionPercentage;
                ctx.session.generatorWallet = new PublicKey(referralRecord.generatorWallet);
            }
            ctx.session.latestCommand = 'buy';
            await ctx.api.sendMessage(ctx.chat.id, "Enter the token Address you would like to Buy.");

        });
        bot.command('sell', async (ctx) => {
            const chatId = ctx.chat.id;
            const referralRecord = await Referrals.findOne({ referredUsers: chatId });
            if (referralRecord) {
                ctx.session.referralCommision = referralRecord.commissionPercentage;
                ctx.session.generatorWallet = new PublicKey(referralRecord.generatorWallet);

            }
            ctx.session.latestCommand = 'sell';
            await ctx.api.sendMessage(ctx.chat.id, "Enter the token Address you would like to sell.");
        });

        bot.command('snipe', async (ctx) => {
            const chatId = ctx.chat.id;
            const referralRecord = await Referrals.findOne({ referredUsers: chatId });
            if (referralRecord) {
                ctx.session.referralCommision = referralRecord.commissionPercentage;
                ctx.session.generatorWallet = new PublicKey(referralRecord.generatorWallet);
            }
            ctx.session.latestCommand = 'snipe';
            await ctx.api.sendMessage(ctx.chat.id, "Enter the token Address you would like to snipe.");
        });

        bot.command('settings', async (ctx) => {
            await handleSettings(ctx);
        });

        bot.on('message', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const latestCommand = ctx.session.latestCommand;
                const msgTxt = ctx.update.message.text;
                switch (latestCommand) {
                    case 'set_slippage': {
                        ctx.session.latestSlippage = Number(msgTxt);
                        if (ctx.session.currentMode === 'buy') {
                            ctx.session.latestCommand = 'buy';
                            await display_token_details(ctx);
                        } else if (ctx.session.currentMode === 'sell') {
                            ctx.session.latestCommand = 'sell';
                            await display_token_details(ctx);
                        } else {
                            await handleSettings(ctx);
                        }
                        break;
                    }
                    case 'set_snipe_slippage': {
                        ctx.session.snipeSlippage = Number(msgTxt);
                        ctx.session.latestCommand = 'snipe';
                        let snipeToken: string = ctx.session.snipeToken instanceof PublicKey ? ctx.session.snipeToken.toBase58() : ctx.session.snipeToken;
                        await display_snipe_options(ctx, snipeToken);
                        break;
                    }
                    case 'rug_check': {
                        if (msgTxt) {
                            if (PublicKey.isOnCurve(msgTxt!)) {
                                let rugCheckToken = new PublicKey(msgTxt);
                                ctx.session.rugCheckToken = rugCheckToken;
                                ctx.session.tokenHistory.push(rugCheckToken); // Add to the beginning of the history

                                // Keep only the last 5 tokens
                                if (ctx.session.tokenHistory.length > 5) {
                                    ctx.session.tokenHistory.shift();
                                }

                                ctx.session.activeTradingPool = await getRayPoolKeys(msgTxt);

                                // Synchronize buyToken and sellToken with the rugCheckToken
                                ctx.session.buyToken = rugCheckToken;
                                ctx.session.sellToken = rugCheckToken;

                                await display_rugCheck(ctx);
                            } else {
                                ctx.api.sendMessage(chatId, "Invalid address");
                            }

                        }
                        break;
                    }
                    case 'buy_X_SOL': await handle_radyum_swap(ctx, (ctx.session.activeTradingPool.baseMint), 'buy', Number(msgTxt)); break;
                    case 'sell_X_TOKEN': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'sell', Number(msgTxt)); break;
                    case 'snipe_X_SOL': {
                        if (msgTxt) {
                            ctx.session.latestCommand = 'snipe';
                            if (ctx.session.snipperLookup) { snipperON(ctx, msgTxt) }
                            else { await setSnipe(ctx, msgTxt); }
                            break;
                        }
                    }
                    case 'import_wallet': {
                        if (ctx.session.latestCommand === 'import_wallet') {
                            const walletImportResult = await importWallet(ctx, String(msgTxt));

                            if (walletImportResult.status === "success") {
                                await ctx.api.sendMessage(chatId, "Wallet imported successfully.");
                            } else if (walletImportResult.status === "wallet_exists") {
                                await ctx.api.sendMessage(chatId, "Wallet already exists.");
                            } else if (walletImportResult.status === "error") {
                                await ctx.api.sendMessage(chatId, `Error: ${walletImportResult.message}`);
                            }
                        }
                        break;
                    }
                    case 'send_sol': {
                        if (ctx.session.latestCommand === 'send_sol') {
                            // Handle recipient address input
                            if (msgTxt) {
                                try {
                                    const recipientAddress = new PublicKey(msgTxt); // Validate address
                                    ctx.session.recipientAddress = recipientAddress;
                                    ctx.session.latestCommand = 'ask_for_sol_amount';
                                    await ctx.api.sendMessage(chatId, "Enter the amount of SOL to send.");
                                } catch (error) {
                                    await ctx.api.sendMessage(chatId, "Invalid recipient address. Please enter a valid Solana address.");
                                    return;
                                }
                            }
                        }
                        break;
                    }
                    case 'ask_for_sol_amount': {
                        if (ctx.session.latestCommand === 'ask_for_sol_amount') {
                            if (msgTxt) {
                                const solAmount = Number(msgTxt);
                                ctx.session.solAmount = solAmount;
                                ctx.session.latestCommand = 'confirm_send_sol';
                                await ctx.api.sendMessage(chatId, `Send ${solAmount} SOL to ${ctx.session.recipientAddress}`, {
                                    reply_markup: {
                                        inline_keyboard: [
                                            [{ text: 'Yes', callback_data: 'confirm_send_sol' }, { text: 'No', callback_data: 'closing' }]
                                        ]
                                    }
                                });
                            }
                        }
                        break;
                    }
                    case 'sell':
                    case 'buy': {
                        try {
                            if (msgTxt && PublicKey.isOnCurve(msgTxt)) {
                                let poolInfo = ctx.session.tokenRayPoolInfo[msgTxt] ?? await getRayPoolKeys(msgTxt);

                                if (!poolInfo) {
                                    ctx.api.sendMessage(chatId, "🔴 Invalid address");
                                    ctx.api.sendMessage(chatId, "🔴 Pool not found for this token."); return;
                                }

                                ctx.session.activeTradingPool = poolInfo;
                                ctx.session.tokenRayPoolInfo[msgTxt] = poolInfo;
                                if (!ctx.session.tokenHistory) ctx.session.tokenHistory = [];
                                if (ctx.session.tokenHistory.indexOf(poolInfo.baseMint) === -1) {
                                    ctx.session.tokenHistory.push(poolInfo.baseMint);
                                    if (ctx.session.tokenHistory.length > 5) ctx.session.tokenHistory.shift();
                                }
                                await display_token_details(ctx);
                            } else {
                                ctx.api.sendMessage(chatId, "🔴 Invalid address");
                            }
                        } catch (e) {
                            ctx.api.sendMessage(chatId, "🔴 Invalid address");
                        }
                        break;
                    }
                    case 'snipe': {
                        if (msgTxt && PublicKey.isOnCurve(msgTxt)) {
                            // ctx.session.activeTradingPool = await getRayPoolKeys(msgTxt)
                            ctx.session.activeTradingPool = await getRayPoolKeys(msgTxt);
                            console.log(" ctx.session.activeTradingPool", ctx.session.activeTradingPool);

                            if (!ctx.session.activeTradingPool) {
                                ctx.session.snipperLookup = true;
                                ctx.session.snipeToken = new PublicKey(msgTxt);
                                display_snipe_options(ctx, msgTxt);
                            } else {
                                ctx.session.snipeToken = new PublicKey(ctx.session.activeTradingPool.baseMint);

                                // Synchronize buyToken and sellToken with snipeToken
                                ctx.session.buyToken = ctx.session.snipeToken;
                                ctx.session.sellToken = ctx.session.snipeToken;

                                // Add snipeToken to token history and update the current index
                                ctx.session.tokenHistory.unshift(ctx.session.snipeToken);
                                if (ctx.session.tokenHistory.length > 5) {
                                    ctx.session.tokenHistory.pop(); // Keep only the last 5 tokens
                                }
                                // Update current token index
                                // ctx.session.currentTokenIndex = 0; 

                                display_snipe_options(ctx, ctx.session.snipeToken.toBase58());
                            }
                        } else {
                            ctx.api.sendMessage(chatId, "Invalid address");
                        }
                        break;
                    }
                    case 'refer_friends': {
                        ctx.session.awaitingWalletAddress = false; // Reset the flag
                        const walletAddress = ctx.message.text;

                        // Generate the referral link with the wallet address
                        if (walletAddress) {
                            const recipientAddress = new PublicKey(walletAddress)
                            const referralLink = await _generateReferralLink(ctx, recipientAddress);
                            const referralData = await _getReferralData(ctx); // Fetch referral data
                            const referEarningSol = (Number(referralData?.totalEarnings) / 1e9).toFixed(6);
                            const details = await getSolanaDetails();
                            const referEarningDollar = (Number(referEarningSol) * details).toFixed(2);
                            let responseMessage = `<b>Referral Program Details</b>\n\n` +
                                `🔗 <b>Your Referral Link:</b> ${referralLink}\n\n` +
                                `👥 <b>Referrals Count:</b> ${referralData?.count}\n` +
                                `💰 <b>Total Earnings:</b> ${referEarningSol} SOL/Token ($${referEarningDollar}) | 0.00 TOKEN\n` +
                                `Rewards are credited instantly to your SOL balance.\n\n` +
                                `💡 <b>Earn Rewards:</b> Receive 35% of trading fees in SOL/$Token from your referrals in the first month, 25% in the second month, and 12% on an ongoing basis.\n\n` +
                                `Your total earnings have been sent to your referral wallet <b>${recipientAddress}</b>.\n\n` +
                                `<i>Note: Rewards are updated and sent in real-time and reflect your active contributions to the referral program.</i>`;
                            const options: any = {
                                reply_markup: JSON.stringify({
                                    inline_keyboard: [

                                        [{ text: 'Close', callback_data: 'closing' }]
                                    ],
                                }),
                                parse_mode: 'HTML',
                                disable_web_page_preview: false,

                            };

                            await ctx.api.sendMessage(chatId, responseMessage, options);
                        }
                        break;
                    }

                }
            } catch (error: any) {
                logErrorToFile('bot on msg', error);
                console.error("ERROR on bot.on txt msg", error);
            }
        });

        bot.on('callback_query', async (ctx: any) => {
            try {
                const chatId = ctx.chat.id;
                const data = ctx.callbackQuery.data;
                // console.log("callback_query", data);
                const positionCallSell = /^sellpos_\d+_\d+$/;
                const positionCallBuy = /^buypos_x_\d+$/;
                const positionNavigate = /^(prev_position|next_position)_\d+$/;

                const matchSell = data.match(positionCallSell);
                const matchBuy = data.match(positionCallBuy);
                const matchNavigate = data.match(positionNavigate);
                if (matchSell) {
                    const parts = data.split('_');
                    const sellPercentage = parts[1]; // '25', '50', '75', or '100'
                    const positionIndex = parts[2]; // Position index

                    // ctx.session.activeTradingPool = ctx.session.positionPool[positionIndex];
                    await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'sell', sellPercentage);
                    return;
                } else if (matchBuy) {
                    const parts = data.split('_');
                    const positionIndex = parts[2]; // Position index
                    // ctx.session.activeTradingPool = ctx.session.positionPool[positionIndex];
                    ctx.api.sendMessage(chatId, "Please enter SOL amount");
                    ctx.session.latestCommand = 'buy_X_SOL';
                    return;
                }
                // else if (matchNavigate) {
                //     const parts = data.split('_');
                //     const newPositionIndex = parseInt(parts[2]); // New position index
                //     console.log("newPositionIndex", newPositionIndex);
                //     console.log("ctx.session.positionPool", ctx.session.positionPool);
                //     // Update the current position index
                //     ctx.session.positionIndex = newPositionIndex;
                //     console.log("ctx.session.positionIndex", ctx.session.positionIndex);

                //     ctx.session.activeTradingPool = ctx.session.positionPool[ctx.session.positionIndex]
                //     console.log("ctx.session.activeTradingPool", ctx.session.activeTradingPool);
                //     // Redisplay the positions with the updated index
                //     await refresh_spl_positions(ctx);
                // }

                switch (data) {
                    case 'refer_friends': {
                        const chatId = ctx.chat.id;
                        const username = ctx.from.username;

                        // Check if the user is allowed to access the referral program
                        if (allowedUsernames.includes(username)) {
                            ctx.session.latestCommand = 'refer_friends';
                            let existingReferral = await Referrals.findOne({ generatorChatId: chatId });

                            if (!existingReferral) {
                                // No existing referral found, ask for the wallet address
                                await ctx.api.sendMessage(chatId, "Please provide the wallet address to receive referral rewards.");
                            } else {
                                // Existing referral found, display referral data
                                const referralData = await _getReferralData(ctx);
                                const referralLink = referralData?.referralLink;
                                const referEarningSol = (Number(referralData?.totalEarnings) / 1e9).toFixed(6);
                                const details = await getSolanaDetails();
                                const referEarningDollar = (Number(referEarningSol) * details).toFixed(6);
                                let responseMessage = `<b>Referral Program Details</b>\n\n` +
                                    `🔗 <b>Your Referral Link:</b> ${referralLink}\n\n` +
                                    `👥 <b>Referrals Count:</b> ${referralData?.count}\n` +
                                    `💰 <b>Total Earnings:</b> ${referEarningSol} SOL/Token ($${referEarningDollar}) | 0.00 TOKEN \n` +
                                    `Rewards are credited instantly to your SOL balance.\n\n` +
                                    `💡 <b>Earn Rewards:</b> Receive 35% of trading fees in SOL/$Token from your referrals in the first month, 25% in the second month, and 12% on an ongoing basis.\n\n` +
                                    `<i>Your total earnings have been sent to your referral wallet.</i>\n\n` +
                                    `<code><b>${referralData?.referralWallet}</b></code>\n\n` +
                                    `<i>Note: Rewards are updated and sent in real-time and reflect your active contributions to the referral program.</i>`; // Fetch referral data

                                const options = {
                                    reply_markup: JSON.stringify({
                                        inline_keyboard: [
                                            [{ text: 'Close', callback_data: 'closing' }]
                                        ],
                                    }),
                                    parse_mode: 'HTML',
                                    disable_web_page_preview: false,

                                };
                                await ctx.api.sendMessage(chatId, responseMessage, options);
                            }
                        } else {
                            // User is not allowed to access the referral program
                            await ctx.api.sendMessage(chatId, "Access to the referral program is currently restricted. Please wait for future updates.");
                        }
                        break;
                    }
                    case 'refresh_start': await handleRefreshStart(ctx);
                        break;
                    case 'refresh_portfolio': await refresh_spl_positions(ctx); break;
                    case 'refrech_rug_check': await Refresh_rugCheck(ctx); break;
                    case 'select_wallet_0':
                        ctx.session.activeWalletIndex = 0;
                        await handleSettings(ctx);
                        await RefreshAllWallets(ctx);

                        break;
                    case 'select_wallet_1':
                        ctx.session.activeWalletIndex = 1;
                        await handleSettings(ctx);
                        await RefreshAllWallets(ctx);

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
                    case 'refresh_snipe': await refreshSnipeDetails(ctx); break;
                    case 'import_wallet': {
                        ctx.session.latestCommand = 'import_wallet';
                        const allowed = await checkWalletsLength(ctx);
                        if (allowed) {
                            await ctx.api.sendMessage(chatId, "Please enter your private/secret key.");
                        }
                        break;
                    }
                    case 'help': await sendHelpMessage(ctx);
                        break;
                    case 'create_new_wallet':
                        const allowed = await checkWalletsLength(ctx);

                        if (allowed) {
                            await createNewWallet(ctx);
                        }

                        break;
                    case 'settings': await handleSettings(ctx); break;
                    case 'get_private_key': await handleGetPrivateKey(ctx); break;
                    case 'cancel_reset_wallet': await handleCloseKeyboard(ctx); break;
                    case 'confirm_reset_wallet': await confirmResetWalletAgain(ctx); break;
                    case 'closing': await handleCloseKeyboard(ctx); break;
                    case 'confirm_send_sol': {
                        const recipientAddress = ctx.session.recipientAddress;
                        const solAmount = ctx.session.solAmount;
                        await ctx.api.sendMessage(chatId, `Sending ${solAmount} SOL to ${recipientAddress}...`);
                        await sendSol(ctx, recipientAddress, solAmount);
                        break;
                    }
                    case 'rug_check': {
                        ctx.session.latestCommand = 'rug_check';
                        ctx.api.sendMessage(chatId, "Please provide the token address for a rug pull analysis.");
                        break;
                    }
                    case 'sell': {
                        ctx.session.latestCommand = 'sell';
                        const referralRecord = await Referrals.findOne({ referredUsers: chatId });
                        if (referralRecord) {
                            ctx.session.referralCommision = referralRecord.commissionPercentage;
                            ctx.session.generatorWallet = referralRecord.generatorWallet;
                        }

                        let tokenToSell = ctx.session.sellToken instanceof PublicKey ? ctx.session.sellToken : undefined;

                        if (!tokenToSell || tokenToSell == DEFAULT_PUBLIC_KEY) {
                            tokenToSell = ctx.session.buyToken instanceof PublicKey && ctx.session.buyToken != DEFAULT_PUBLIC_KEY ? ctx.session.buyToken : undefined;
                        }

                        if (tokenToSell) {
                            const tokenString = tokenToSell.toBase58();

                            let poolInfo = ctx.session.tokenRayPoolInfo[tokenString];

                            if (!poolInfo) {
                                poolInfo = await getRayPoolKeys(tokenString);
                                ctx.session.tokenRayPoolInfo[tokenString] = poolInfo;
                            }

                            ctx.session.sellToken = tokenToSell;
                            ctx.session.activeTradingPool = poolInfo;

                            // Synchronize buyToken with the current sellToken
                            ctx.session.buyToken = tokenToSell;

                            await display_token_details(ctx);
                        } else {
                            await ctx.api.sendMessage(chatId, "Enter the token Address you would like to sell.");
                        }
                        break;
                    }
                    case 'buy': {
                        ctx.session.latestCommand = 'buy';
                        const referralRecord = await Referrals.findOne({ referredUsers: chatId });
                        if (referralRecord) {
                            ctx.session.referralCommision = referralRecord.commissionPercentage;
                            ctx.session.generatorWallet = referralRecord.generatorWallet;
                            // console.log('ctx.session.referralCommision', ctx.session.referralCommision);
                        }

                        let tokenToBuy = ctx.session.buyToken instanceof PublicKey ? ctx.session.buyToken : undefined;

                        if (!tokenToBuy || tokenToBuy == DEFAULT_PUBLIC_KEY) {
                            tokenToBuy = ctx.session.sellToken instanceof PublicKey && ctx.session.sellToken != DEFAULT_PUBLIC_KEY ? ctx.session.sellToken : undefined;
                        }

                        if (tokenToBuy) {
                            const tokenString = tokenToBuy.toBase58();
                            let poolInfo = ctx.session.tokenRayPoolInfo[tokenString];

                            if (!poolInfo) {
                                poolInfo = await getRayPoolKeys(tokenString);
                                ctx.session.tokenRayPoolInfo[tokenString] = poolInfo;
                            }

                            ctx.session.buyToken = tokenToBuy;
                            ctx.session.activeTradingPool = poolInfo;

                            // Synchronize sellToken with the current buyToken
                            ctx.session.sellToken = tokenToBuy;

                            await display_token_details(ctx);
                        } else {
                            await ctx.api.sendMessage(chatId, "Enter the token Address you would like to Buy.");
                        }
                        break;
                    }
                    case 'snipe': {
                        const referralRecord = await Referrals.findOne({ referredUsers: chatId });
                        if (referralRecord) {
                            ctx.session.referralCommision = referralRecord.commissionPercentage;
                            ctx.session.generatorWallet = referralRecord.generatorWallet;
                        }
                        let snipeToken = ctx.session.snipeToken;
                        ctx.session.latestCommand = 'snipe';
                        if (snipeToken == DEFAULT_PUBLIC_KEY) {
                            await ctx.api.sendMessage(chatId, "Enter token address to Snipe.");
                        } else {
                            snipeToken = snipeToken instanceof PublicKey ? snipeToken.toBase58() : snipeToken;
                            await display_snipe_options(ctx, snipeToken);
                        }
                        break;
                    }
                    case 'cancel_snipe': {
                        ctx.session.snipeStatus = false;
                        await ctx.api.sendMessage(chatId, "Sniper cancelled.");
                        break;
                    }
                    case 'set_slippage': {
                        ctx.session.latestCommand = 'set_slippage';
                        ctx.api.sendMessage(chatId, "Please enter slippage % amount");
                        break;
                    }
                    case 'set_snipe_slippage': {
                        ctx.session.latestCommand = 'set_snipe_slippage';
                        ctx.api.sendMessage(chatId, "Please enter slippage % amount");
                        break;
                    }
                    case 'send_sol': {
                        ctx.session.latestCommand = 'send_sol';
                        ctx.api.sendMessage(chatId, "Please paste the recipient's wallet address.");
                        break;
                    }
                    case 'previous_token': {
                        let history = ctx.session.tokenHistory;
                        let currentToken: PublicKey = ctx.session.latestCommand === 'buy' ? ctx.session.buyToken : ctx.session.sellToken;
                        let currentTokenStr = currentToken instanceof PublicKey ? currentToken.toBase58() : currentToken;
                        let historyStr = history.map((token: any) => token.toBase58());
                        let currentIndex = historyStr.indexOf(currentTokenStr);

                        if (currentIndex > 0) {
                            let previousTokenStr = historyStr[currentIndex - 1];
                            let previousToken = new PublicKey(previousTokenStr);

                            // Update both buyToken and sellToken regardless of the latest command
                            ctx.session.buyToken = previousToken;
                            ctx.session.sellToken = previousToken;

                            // Check if the pool info is already in the session
                            let poolInfo = ctx.session.tokenRayPoolInfo[previousTokenStr];
                            if (!poolInfo) {
                                poolInfo = await getRayPoolKeys(previousTokenStr);
                                ctx.session.tokenRayPoolInfo[previousTokenStr] = poolInfo;
                            }

                            ctx.session.activeTradingPool = poolInfo;
                            await refreshTokenDetails(ctx);
                        }
                        break;
                    }

                    case 'next_token': {
                        let history = ctx.session.tokenHistory;
                        let currentToken = ctx.session.latestCommand === 'buy' ? ctx.session.buyToken : ctx.session.sellToken;
                        let currentTokenStr = currentToken instanceof PublicKey ? currentToken.toBase58() : currentToken;
                        let historyStr = history.map((token: any) => token.toBase58());
                        let currentIndex = historyStr.indexOf(currentTokenStr);

                        if (currentIndex >= 0 && currentIndex < history.length - 1) {
                            let nextTokenStr = historyStr[currentIndex + 1];
                            let nextToken = new PublicKey(nextTokenStr);

                            // Update both buyToken and sellToken regardless of the latest command
                            ctx.session.buyToken = nextToken;
                            ctx.session.sellToken = nextToken;

                            // Check if the pool info is already in the session
                            let poolInfo = ctx.session.tokenRayPoolInfo[nextTokenStr];
                            if (!poolInfo) {
                                poolInfo = await getRayPoolKeys(nextTokenStr);
                                ctx.session.tokenRayPoolInfo[nextTokenStr] = poolInfo;
                            }

                            ctx.session.activeTradingPool = poolInfo;
                            await refreshTokenDetails(ctx);
                        }
                        break;
                    }

                    case 'buy_0.1_SOL': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'buy', '0.1'); break;
                    case 'buy_0.2_SOL': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'buy', '0.2'); break;
                    case 'buy_0.5_SOL': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'buy', '0.5'); break;
                    case 'buy_1_SOL': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'buy', '1'); break;
                    case 'buy_5_SOL': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'buy', '5'); break;
                    case 'buy_X_SOL': {
                        ctx.session.latestCommand = 'buy_X_SOL';
                        ctx.api.sendMessage(chatId, "Please enter SOL amount");
                        break;
                    }
                    case 'sell_10_TOKEN': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'sell', '10',); break;
                    case 'sell_25_TOKEN': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'sell', '25',); break;
                    case 'sell_30_TOKEN': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'sell', '30',); break;
                    case 'sell_50_TOKEN': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'sell', '50',); break;
                    case 'sell_75_TOKEN': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'sell', '75',); break;
                    case 'sell_100_TOKEN': await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, 'sell', '100',); break;
                    case 'sell_X_TOKEN': {
                        ctx.session.latestCommand = 'sell_X_TOKEN';
                        ctx.api.sendMessage(chatId, "Please enter amount to sell.");
                        break;
                    }
                    case 'snipe_0.1_SOL': {
                        if (ctx.session.snipperLookup) { await snipperON(ctx, '0.1') }
                        else { await setSnipe(ctx, '0.1'); }
                        break;
                    }
                    case 'snipe_0.2_SOL': {
                        if (ctx.session.snipperLookup) { snipperON(ctx, '0.2') }
                        else { await setSnipe(ctx, '0.2'); }
                        break;
                    }
                    case 'snipe_0.5_SOL': {
                        if (ctx.session.snipperLookup) { snipperON(ctx, '0.5') }
                        else { await setSnipe(ctx, '0.5'); }
                        break;
                    }
                    case 'snipe_1_SOL': {
                        if (ctx.session.snipperLookup) { snipperON(ctx, '1') }
                        else { await setSnipe(ctx, '1'); }
                        break;
                    }
                    case 'snipe_5_SOL': {
                        if (ctx.session.snipperLookup) { snipperON(ctx, '5') }
                        else { await setSnipe(ctx, '5'); }
                        break;
                    }
                    case 'snipe_X_SOL': {
                        ctx.session.latestCommand = 'snipe_X_SOL';
                        ctx.api.sendMessage(chatId, "Please enter amount to snipe.");
                        break;
                    }
                    case 'display_spl_positions': { await display_spl_positions(ctx); break; }
                    case 'priority_low': {
                        ctx.session.priorityFees = PriotitizationFeeLevels.LOW;
                        if (ctx.session.latestCommand === 'snipe') {
                            await refreshSnipeDetails(ctx);

                        } else {
                            await refreshTokenDetails(ctx);
                        }
                        console.log('ctx.session.priorityFees', ctx.session.priorityFees);
                        break;
                    }
                    case 'priority_medium': {
                        ctx.session.priorityFees = PriotitizationFeeLevels.MEDIUM;
                        if (ctx.session.latestCommand === 'snipe') {
                            await refreshSnipeDetails(ctx);

                        } else {
                            await refreshTokenDetails(ctx);
                        }

                        console.log('ctx.session.priorityFees', ctx.session.priorityFees);
                        break;
                    }
                    case 'priority_high': {
                        ctx.session.priorityFees = PriotitizationFeeLevels.HIGH;
                        if (ctx.session.latestCommand === 'snipe') {
                            await refreshSnipeDetails(ctx);

                        } else {
                            await refreshTokenDetails(ctx);
                        }

                        console.log('ctx.session.priorityFees', ctx.session.priorityFees);

                        break;
                    }
                    case 'priority_max': {
                        ctx.session.priorityFees = PriotitizationFeeLevels.MAX;
                        if (ctx.session.latestCommand === 'snipe') {
                            await refreshSnipeDetails(ctx);

                        } else {
                            await refreshTokenDetails(ctx);
                        }

                        console.log('ctx.session.priorityFees', ctx.session.priorityFees);

                        break;
                    }
                }
                ctx.api.answerCallbackQuery(ctx.callbackQuery.id);
            } catch (error: any) {
                logErrorToFile('bot on callback_query', error);
                console.error(error);
            }
        });

        // bot.command('refer_friends', async (ctx) => {
        //     const chatId = ctx.chat.id;
        //     const referralLink = generateReferralLink(ctx); // Implement this function
        //     ctx.api.sendMessage(chatId, `Share this link with your friends to invite them: ${referralLink}`);
        // });

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
    }
}).catch((error: any) => {
    console.error("Error", error);
});







