import {
  createUserPortfolio,
  createNewWallet,
  handleGetPrivateKey,
  checkWalletsLength,
  confirmResetWalletAgain,
  resetWallet,
} from "./service/portfolio/wallets";
import { handle_radyum_swap } from "./service/portfolio/strategies/swaps";
import {
  Bot,
  Context,
  GrammyError,
  HttpError,
  session,
  SessionFlavor,
  webhookCallback,
} from "grammy";
import { importWallet, getPortfolio } from "./service/portfolio/wallets";
import {
  ISESSION_DATA,
  DefaultSessionData,
  PORTFOLIO_TYPE,
  DefaultPortfolioData,
} from "./service/util/types";
import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import { _initDbConnection } from "./db/mongo/crud";
import { handleSettings } from "./service/settings";
import { getSolanaDetails } from "./api";
import { setSnipe, snipperON } from "./service/portfolio/strategies/snipper";
import {
  display_token_details,
  display_snipe_options,
  handleCloseKeyboard,
  display_after_Snipe_Buy
  // Refresh_display_after_Snipe_Buy,
} from "./views";
import { getSolBalance, sendSol } from "./service/util";
import {
  handleRefreshStart,
  handleRereshWallet,
} from "./views/refreshData/refreshStart";
import { handleWallets } from "./views/util/dbWallet";
import { RefreshAllWallets } from "./views/refreshData/RefresHandleWallets";
import { getRayPoolKeys } from "./service/dex/raydium/raydium-utils/formatAmmKeysById";
import { sendHelpMessage } from "./views/util/helpMessage";
import { display_rugCheck } from "./views/rugCheck";
import { _generateReferralLink, _getReferralData } from "../src/db/mongo/crud";
import { Portfolios, Referrals } from "./db/mongo/schema";
import { display_spl_positions, display_single_spl_positions} from "./views/portfolioView";
import { PriotitizationFeeLevels } from "../src/service/fees/priorityFees";
import { logErrorToFile } from "../error/logger";
const express = require('express');
const app = express();

/*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
/*                  BOT START & SET ENV                       */
/*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
type MyContext = Context & SessionFlavor<ISESSION_DATA>;
const isProd = process.env.NODE_ENV == "PROD";
_initDbConnection();
const keys = process.env.TELEGRAM_BOT_TOKEN;
const bot = new Bot<MyContext>(keys!);
bot.use(
  session({ initial: () => JSON.parse(JSON.stringify(DefaultSessionData)) })
);

bot.use(async (ctx, next) => {
  const messageTimestamp = ctx.message?.date;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const threshold = 20;
  if (messageTimestamp && (currentTimestamp - messageTimestamp) > threshold) {
    console.error("This message was sent while I was offline and is now too old. Please resend your message if it's still relevant.");
  } else {
    return next();
  }
});

/*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
/*                  BOT WEBHOOK                              */
/*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/

const botToken = process.env.TELEGRAM_BOT_TOKEN!;
const port = process.env.PORT || 80;


if (isProd) {
  const webhookUrl = 'https://drib.ngrok.app';
  const url = `${webhookUrl}/${botToken}`;

  // Create the HTTP server and define request handling logic
  app.use(express.json()); // for parsing application/json

  app.post(`/${botToken}`, webhookCallback(bot, 'express'));
  app.use(`/${botToken}`, webhookCallback(bot, 'express'));

  app.get('/', (req: any, res: any) => {
    res.send('Hello from ngrok server!');
  });

  app.listen(port, async () => {
    console.log(`Server is running on port ${port}`);
    await bot.api.setWebhook(url)
      .then(() => console.log("Webhook set successfully"))
      .catch(err => console.error("Error setting webhook:", err)
      );
  });
} else {
  bot.start();
}

const allowedUsernames = [
  "tech_01010",
  "daniellesifg",
  "swalefdao",
  "coachalib",
]; // without the @

/*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
/*                      BOT START                             */
/*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
bot.command("start", async (ctx: any) => {
  try {
    const chatId = ctx.chat.id;
    const portfolio: PORTFOLIO_TYPE = await getPortfolio(chatId); // returns portfolio from db if true
    let isNewUser = false;
    const connection = new Connection(
      `${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`
    );

    let referralCode = null;
    // Check if there's additional text with the /start command
    if (ctx.message.text.includes(" ")) {
      referralCode = ctx.message.text.split(" ")[1];
    }
    // if user already exists
    if (portfolio == DefaultPortfolioData) {
      // User is new
      isNewUser = true;
    }

    const userName = ctx.message.from.username;
    console.log("userName:", userName);

    const allowedUsers = allowedUsernames.includes(userName);

    if (referralCode || allowedUsers) {
      const referralRecord = await Referrals.findOne({
        referralCode: referralCode,
      });
      if (referralRecord && referralRecord.generatorChatId !== chatId) {
        if (!referralRecord.referredUsers.includes(chatId)) {
          // Add the user's chatId to the referredUsers array
          referralRecord.referredUsers.push(chatId);

          // Increment the referral count
          referralRecord.numberOfReferrals! += 1;
          await referralRecord.save();
          ctx.session.generatorWallet = new PublicKey(
            referralRecord.generatorWallet
          );
          ctx.session.referralCommision = referralRecord.commissionPercentage;
          // ctx.session.referralEarnings = referralRecord.earnings;
          // Optional: Notify the user that they have been referred successfully
          await ctx.reply("Welcome! You have been referred successfully.");
        } else {
          ctx.session.generatorWallet = referralRecord.generatorWallet;
          ctx.session.referralCommision = referralRecord.commissionPercentage;
        }
      }
    } else if (isNewUser) {
      // New user without a referral code
      await ctx.api.sendMessage(
        chatId,
        "Welcome to DRIBs bot. Please start the bot using a referral link."
      );
      return;
    }

    //-------Start bot with wallet---------------------------
    ctx.session.latestCommand = "start";
    let userWallet: Keypair | null = null;

    if (portfolio != DefaultPortfolioData) {
      ctx.session.portfolio = portfolio;
    } else {
      // at this point wallet from session is not avialable yet
      // hence we do ctx.session.portfolio = await getPortfolio(chatId); at the end of the "start" function.
      userWallet = await createUserPortfolio(ctx); // => { publicKey, secretKey }
      ctx.session.portfolio.wallets[ctx.session.activeWalletIndex] = userWallet;
    }
    const publicKeyString: PublicKey | String = userWallet
    ? userWallet.publicKey
    : ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex].publicKey;

    // Retrieve the current SOL details
    let solPriceMessage = "";
    const [balanceInSOL, details] = await Promise.all([
      getSolBalance(publicKeyString, connection),
      getSolanaDetails()
  ]);
   
    // Fetch SOL balance
    if (balanceInSOL === null) {
      await ctx.api.sendMessage(chatId, "Error fetching wallet balance.");
      return;
    }

    // solana price
    if (details) {
      const solData = details.toFixed(2);
      solPriceMessage = `\n\SOL Price: <b>${solData}</b> USD`;
    } else {
      solPriceMessage = "\nError fetching current SOL price.";
    }

    // Combine the welcome message, SOL price message, and instruction to create a wallet
    const welcomeMessage =
      `✨ Welcome to <b>DRIBs bot</b> - Your Advanced Trading Companion! ✨\n` +
      `Begin by extracting your wallet's private key. Then, you're all set to start trading!\n` +
      `Choose from two wallets: start with the default one or import yours using the "Import Wallet" button.\n` +
      `We're always working to bring you new features - stay tuned!\n\n` +
      `Your Wallet: <code><b>${publicKeyString}</b></code>\n` +
      `Balance: <b>${balanceInSOL.toFixed(4)}</b> SOL | <b>${(
        balanceInSOL * details
      ).toFixed(2)}</b> USD\n\n` +
      `🖐🏼 For security, we recommend exporting your private key and keeping it paper.`;

    // Set the options for th e inline keyboard with social links
    const options: any = {
      reply_markup: JSON.stringify({
        inline_keyboard: [
          // [
          //     { text: '🌎 Website', url: 'https://moonvera.io/' },
          //     { text: '𝚇', url: 'https://twitter.com/moonvera_' }

          // ],
          [
            { text: "⬇️ Import Wallet", callback_data: "import_wallet" },
            { text: "💼 Wallets & Settings⚙️", callback_data: "show_wallets" },
          ],
          [{ text: "☑️ Rug Check", callback_data: "rug_check" }],
          [{ text: "🎯 Turbo Snipe", callback_data: "snipe" }],
          [
            { text: "💱 Buy", callback_data: "buy" },
            { text: "Sell 📈", callback_data: "sell" },
          ],
          [
            { text: "ℹ️ Help", callback_data: "help" },
            { text: "Refer Friends", callback_data: "refer_friends" },
          ],
          [{ text: "Refresh", callback_data: "refresh_start" }],
          [{ text: "Positions", callback_data: "display_spl_positions" }],
        ],
      }),
      parse_mode: "HTML",
    };
    // Send the message with the inline keyboard
    ctx.api.sendMessage(chatId, ` ${welcomeMessage}`, options);
    ctx.session.portfolio = await getPortfolio(chatId);
    ctx.session.latestCommand = "optional";
  } catch (error: any) {

    logErrorToFile("bot on start cmd", error);

    if (error instanceof GrammyError || error instanceof HttpError || error instanceof Error || error instanceof TypeError || error instanceof RangeError) {
      console.error("Callback query failed due to timeout or invalid ID.", error);
    } else {
      console.error(error.message);
    }
  }
});

bot.command("help", async (ctx) => {
  await sendHelpMessage(ctx);
});

bot.command("positions", async (ctx) => {
  try {
    // await ctx.api.sendMessage(ctx.chat.id, `Loading your positions...`);
    await display_spl_positions(ctx, false);
  } catch (error: any) {
    logErrorToFile("bot on positions cmd", error);
  }
});

bot.command("rugchecking", async (ctx) => {
  try {
    await ctx.api.sendMessage(
      ctx.chat.id,
      "Please provide the token address for a rug pull analysis."
    );
    ctx.session.latestCommand = "rug_check";
  } catch (error: any) {
    logErrorToFile("bot on rugchecking cmd", error);
  }
});

bot.command("buy", async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const referralRecord = await Referrals.findOne({ referredUsers: chatId });
    if (referralRecord) {
      ctx.session.referralCommision = referralRecord.commissionPercentage;
      ctx.session.generatorWallet = new PublicKey(
        referralRecord.generatorWallet
      );
    }
    ctx.session.latestCommand = "buy";
    await ctx.api.sendMessage(
      ctx.chat.id,
      "Enter the token Address you would like to Buy."
    );
  } catch (error: any) {
    logErrorToFile("bot on buy cmd", error);
  }
});

bot.command("sell", async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const referralRecord = await Referrals.findOne({ referredUsers: chatId });
    if (referralRecord) {
      ctx.session.referralCommision = referralRecord.commissionPercentage;
      ctx.session.generatorWallet = new PublicKey(
        referralRecord.generatorWallet
      );
    }
    ctx.session.latestCommand = "sell";
    await ctx.api.sendMessage(
      ctx.chat.id,
      "Enter the token Address you would like to sell."
    );
  } catch (error: any) {
    logErrorToFile("bot on sell cmd", error);
  }
});

bot.command("snipe", async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    ctx.session.snipeStatus = true;
    const referralRecord = await Referrals.findOne({ referredUsers: chatId });
    if (referralRecord) {
      ctx.session.referralCommision = referralRecord.commissionPercentage;
      ctx.session.generatorWallet = new PublicKey(
        referralRecord.generatorWallet
      );
    }
    ctx.session.latestCommand = "snipe";
    await ctx.api.sendMessage(
      ctx.chat.id,
      "Enter the token Address you would like to snipe."
    );
  } catch (error: any) {
    logErrorToFile("bot on snipe cmd", error);
  }
});

bot.command("settings", async (ctx) => {
  try {
    await handleSettings(ctx);
  } catch (error: any) {
    logErrorToFile("bot.command('settings',", error);
  }
});

/*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
/*                      BOT ON MSG                            */
/*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/

bot.on("message", async (ctx) => {
  const chatId = ctx.chat.id;

  try {
    const latestCommand = ctx.session.latestCommand;
    const msgTxt = ctx.update.message.text;
  
   
       switch (latestCommand) {
        case "optional": {
            if(msgTxt){
                if (PublicKey.isOnCurve(msgTxt)) {
                  const isTOken = await checkAccountType(ctx, msgTxt);
                  if (!isTOken) {
                    ctx.api.sendMessage(chatId, "Invalid address");
                    return;
                  }
                  ctx.session.latestToken = new PublicKey(msgTxt);
                  const addressOptions = {
                    reply_markup: {
                      inline_keyboard: [
                        [{ text: "Snipe", callback_data: "snipe" }],
                        [{ text: "Buy", callback_data: "buy" }]
                      ]
                    },
                    // parse_mode: "HTML",
                  };
                  await ctx.api.sendMessage(chatId, "Choose an action for the address:", addressOptions);
                  return;  // Stop further processing to wait for next command
              }
            }          
                break;
        }
      case "set_slippage": {
        ctx.session.latestSlippage = Number(msgTxt);
        if (ctx.session.currentMode === "buy") {
          ctx.session.latestCommand = "buy";
          await display_token_details(ctx, false);
        } else if (ctx.session.currentMode === "sell") {
          ctx.session.latestCommand = "sell";
          await display_token_details(ctx, false);
        } else {
          await handleSettings(ctx);
        }
        break;
      }
      case "set_snipe_slippage": {
        ctx.session.snipeSlippage = Number(msgTxt);
        ctx.session.latestCommand = "snipe";
        let snipeToken: string =
          ctx.session.snipeToken instanceof PublicKey
            ? ctx.session.snipeToken.toBase58()
            : ctx.session.snipeToken;
        await display_snipe_options(ctx,false, snipeToken);
        break;
      }
      case "rug_check": {
        if (msgTxt) {
          if (PublicKey.isOnCurve(msgTxt!)) {
            const isTOken = await checkAccountType(ctx, msgTxt);
            if (!isTOken) {
              ctx.api.sendMessage(chatId, "Invalid address");
              return;
            }
            ctx.session.latestCommand = "rug_check";
            let rugCheckToken = new PublicKey(msgTxt);
            ctx.session.rugCheckToken = rugCheckToken;
            ctx.session.activeTradingPool = await getRayPoolKeys(ctx, msgTxt);

            await display_rugCheck(ctx, false);
          } else {
            ctx.api.sendMessage(chatId, "Invalid address");
          }
        }
        break;
      }
      case "buy_X_SOL":
        if (msgTxt) {
          const amt = msgTxt.includes('.') ? Number.parseFloat(msgTxt) : Number.parseInt(msgTxt);
          if (!isNaN(amt)) {
            await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, "buy", Number(msgTxt));
            break;
          } else {
            return await ctx.api.sendMessage(chatId, "🔴 Invalid amount");
          }
        }
      case "sell_X_TOKEN":
        if (msgTxt) {
          const amt = msgTxt.includes('.') ? Number.parseFloat(msgTxt) : Number.parseInt(msgTxt);
          if (!isNaN(amt)) {
            await handle_radyum_swap(ctx, ctx.session.activeTradingPool.baseMint, "sell", Number(msgTxt));
            break;
          } else {
            return await ctx.api.sendMessage(chatId, "🔴 Invalid amount");
          }
        }
        break;
      case "snipe_X_SOL": {
        if (msgTxt) {
          const amt = msgTxt.includes('.') ? Number.parseFloat(msgTxt) : Number.parseInt(msgTxt);
          if (!isNaN(amt)) {
            ctx.session.latestCommand = "snipe";
            if (ctx.session.snipperLookup) {
              await snipperON(ctx, String(amt));
            } else {
              await setSnipe(ctx, String(amt));
            }
          } else {
            return await ctx.api.sendMessage(chatId, "🔴 Invalid amount");
          }
        }
        break;
      }
      case "import_wallet": {
        if (ctx.session.latestCommand === "import_wallet") {
          const walletImportResult = await importWallet(ctx, String(msgTxt));

          if (walletImportResult.status === "success") {
            await ctx.api.sendMessage(chatId, "Wallet imported successfully.");
          } else if (walletImportResult.status === "wallet_exists") {
            await ctx.api.sendMessage(chatId, "Wallet already exists.");
          } else if (walletImportResult.status === "error") {
            await ctx.api.sendMessage(
              chatId,
              `Error: ${walletImportResult.message}`
            );
          }
        }
        break;
      }
      case "send_sol": {
        if (ctx.session.latestCommand === "send_sol") {
          // Handle recipient address input
          if (msgTxt) {
            try {
              const recipientAddress = new PublicKey(msgTxt); // Validate address
              ctx.session.recipientAddress = recipientAddress;
              ctx.session.latestCommand = "ask_for_sol_amount";
              await ctx.api.sendMessage(
                chatId,
                "Enter the amount of SOL to send."
              );
            } catch (error) {
              await ctx.api.sendMessage(
                chatId,
                "Invalid recipient address. Please enter a valid Solana address."
              );
              return;
            }
          }
        }
        break;
      }
      case "ask_for_sol_amount": {
        if (ctx.session.latestCommand === "ask_for_sol_amount") {
          if (msgTxt) {
            const solAmount = Number(msgTxt);
            ctx.session.solAmount = solAmount;
            ctx.session.latestCommand = "confirm_send_sol";
            await ctx.api.sendMessage(
              chatId,
              `Send ${solAmount} SOL to ${ctx.session.recipientAddress}`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: "Yes", callback_data: "confirm_send_sol" },
                      { text: "No", callback_data: "closing" },
                    ],
                  ],
                },
              }
            );
          }
        }
        break;
      }
      case "sell":
      case "buy": {
        try {
          if (msgTxt && PublicKey.isOnCurve(msgTxt)) {
            //to avoid crashin with wron address
            const isTOken = await checkAccountType(ctx, msgTxt);
            if (!isTOken) {
              ctx.api.sendMessage(chatId, "Invalid address");
              return;
            }
            let poolInfo = await getRayPoolKeys(ctx, msgTxt);

            if (!poolInfo) {
              ctx.session.latestCommand = 'snipe';
              ctx.session.snipperLookup = true;
              ctx.session.snipeToken = new PublicKey(msgTxt);
              display_snipe_options(ctx,false, msgTxt);
              // ctx.api.sendMessage(chatId, "🔴 Invalid address");
              // ctx.api.sendMessage(chatId, "🔴 Pool not found for this token.");
              return;
            }
            ctx.session.activeTradingPool = poolInfo;
            await display_token_details(ctx, false);
          } else {
            ctx.api.sendMessage(chatId, "🔴 Invalid address");
          }
        } catch (e) {
          ctx.api.sendMessage(chatId, "🔴 Please entre a valid address");
        }
        break;
      }
      case "snipe": {
        ctx.session.snipeStatus = true;
        try {
          if (msgTxt && PublicKey.isOnCurve(msgTxt)) {
            const isTOken = await checkAccountType(ctx, msgTxt);
            // console.log("isTOken", isTOken);
            if (!isTOken) {
              ctx.api.sendMessage(chatId, "Invalid address");
              return;
            }

            ctx.session.activeTradingPool = await getRayPoolKeys(ctx, msgTxt);
            // console.log("ctx.session.activeTradingPool", ctx.session.activeTradingPool);
            if (!ctx.session.activeTradingPool) {
              ctx.session.snipperLookup = true;
              ctx.session.snipeToken = new PublicKey(msgTxt);
              display_snipe_options(ctx, false, msgTxt);
            } else {
              ctx.session.snipeToken = new PublicKey(
                ctx.session.activeTradingPool.baseMint
              );

              display_snipe_options(ctx, false, ctx.session.snipeToken.toBase58());
            }
          } else if (msgTxt && !PublicKey.isOnCurve(msgTxt)) {
            ctx.api.sendMessage(chatId, "Invalid address");
          }
        } catch (error: any) {
          console.error("Error in 'snipe' command:", error.message);

        }
        break;
      }
      case "refer_friends": {
        ctx.session.awaitingWalletAddress = false; // Reset the flag
        const walletAddress = ctx.message.text;

        // Generate the referral link with the wallet address
        if (walletAddress) {
          const recipientAddress = new PublicKey(walletAddress);
          const referralLink = await _generateReferralLink(
            ctx,
            recipientAddress
          );
          const referralData = await _getReferralData(ctx); // Fetch referral data
          const referEarningSol = (
            Number(referralData?.totalEarnings) / 1e9
          ).toFixed(6);
          const details = await getSolanaDetails();
          const referEarningDollar = (
            Number(referEarningSol) * details
          ).toFixed(2);
          let responseMessage =
            `<b>Referral Program Details</b>\n\n` +
            `🔗 <b>Your Referral Link:</b> ${referralLink}\n\n` +
            `👥 <b>Referrals Count:</b> ${referralData?.count}\n` +
            `💰 <b>Total Earnings:</b> ${referEarningSol} SOL/Token ($${referEarningDollar}) | 0.00 TOKEN\n` +
            `Rewards are credited instantly to your SOL balance.\n\n` +
            `💡 <b>Earn Rewards:</b> Receive 35% of trading fees in SOL/$Token from your referrals.\n\n` +
            `Your total earnings have been sent to your referral wallet <b>${recipientAddress}</b>.\n\n` +
            `<i>Note: Rewards are updated and sent in real-time and reflect your active contributions to the referral program.</i>`;
          const options: any = {
            reply_markup: JSON.stringify({
              inline_keyboard: [[{ text: "Close", callback_data: "closing" }]],
            }),
            parse_mode: "HTML",
            disable_web_page_preview: false,
          };

          await ctx.api.sendMessage(chatId, responseMessage, options);
        }
        break;
      }
    }
  } catch (error: any) {
    await ctx.api.sendMessage(chatId, `${error.message})`);
    console.error("ERROR on bot.on txt msg", error, error.message);
    logErrorToFile("bot.on('message'", error);
  }
});

/*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
/*                      BOT ON CALLBACK                       */
/*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
bot.on("callback_query", async (ctx: any) => {
  try {
    const chatId = ctx.chat.id;
    const data = ctx.callbackQuery.data;
    // console.log("callback_query", data);
    const positionCallSell = /^sellpos_\d+_\d+$/;
    const positionCallBuy = /^buypos_x_\d+$/;
    const positionNavigate = /^(prev_position|next_position)_\d+$/;
    ctx.api.answerCallbackQuery(ctx.callbackQuery.id);

    const matchSell = data.match(positionCallSell);
    const matchBuy = data.match(positionCallBuy);
    const matchNavigate = data.match(positionNavigate);

    if (matchSell) {
      const parts = data.split("_");
      const sellPercentage = parts[1]; // '25', '50', '75', or '100'
      const positionIndex = parts[2]; // Position index
      ctx.session.activeTradingPool = ctx.session.positionPool[positionIndex];

      await handle_radyum_swap(
        ctx,
        ctx.session.activeTradingPool.baseMint,
        "sell",
        sellPercentage
      );

      return;
    } else if (matchBuy) {
      const parts = data.split("_");
      const positionIndex = parts[2]; // Position index
      ctx.session.activeTradingPool = ctx.session.positionPool[positionIndex];
      ctx.api.sendMessage(chatId, "Please enter SOL amount");
      ctx.session.latestCommand = "buy_X_SOL";

      return;
    } else if (matchNavigate) {
      const parts = data.split("_");
      const newPositionIndex = parseInt(parts[2]); // New position index

      ctx.session.positionIndex = newPositionIndex;
      ctx.session.activeTradingPool =
        ctx.session.positionPool[ctx.session.positionIndex];

      await display_single_spl_positions(ctx, true);
    }

    switch (data) {
      case "refer_friends": {
        const chatId = ctx.chat.id;
        const username = ctx.update.callback_query.from.username; //ctx.from.username;

        // Check if the user is allowed to access the referral program
        if (allowedUsernames.includes(username)) {
          ctx.session.latestCommand = "refer_friends";
          let existingReferral = await Referrals.findOne({
            generatorChatId: chatId,
          });

          if (!existingReferral) {
            // No existing referral found, ask for the wallet address
            await ctx.api.sendMessage(
              chatId,
              "Please provide the wallet address to receive referral rewards."
            );
          } else {
            // Existing referral found, display referral data
            const referralData = await _getReferralData(ctx);
            const referralLink = referralData?.referralLink;
            const referEarningSol = (
              Number(referralData?.totalEarnings) / 1e9
            ).toFixed(6);
            const details = await getSolanaDetails();
            const referEarningDollar = (
              Number(referEarningSol) * details
            ).toFixed(6);
            let responseMessage =
              `<b>Referral Program Details</b>\n\n` +
              `🔗 <b>Your Referral Link:</b> ${referralLink}\n\n` +
              `👥 <b>Referrals Count:</b> ${referralData?.count}\n` +
              `💰 <b>Total Earnings:</b> ${referEarningSol} SOL/Token ($${referEarningDollar}) | 0.00 TOKEN \n` +
              `Rewards are credited instantly to your SOL balance.\n\n` +
              `💡 <b>Earn Rewards:</b> Receive 35% of trading fees in SOL/$Token from your referrals.\n\n` +
              `<i>Your total earnings have been sent to your referral wallet.</i>\n\n` +
              `<code><b>${referralData?.referralWallet}</b></code>\n\n` +
              `<i>Note: Rewards are updated and sent in real-time and reflect your active contributions to the referral program.</i>`; // Fetch referral data

            const options = {
              reply_markup: JSON.stringify({
                inline_keyboard: [
                  [{ text: "Close", callback_data: "closing" }],
                ],
              }),
              parse_mode: "HTML",
              disable_web_page_preview: false,
            };
            await ctx.api.sendMessage(chatId, responseMessage, options);
          }
        } else {
          // User is not allowed to access the referral program
          await ctx.api.sendMessage(
            chatId,
            "Access to the referral program is currently restricted. Please wait for future updates."
          );
        }
        break;
      }
      case "refresh_start":
        await handleRefreshStart(ctx);
        break;
      case "refresh_portfolio":
        await display_spl_positions(ctx,true);
        break;
      case "refrech_rug_check":
        let isRefresh = true
        await display_rugCheck(ctx, isRefresh);
        break;
      case "select_wallet_0":
        const portfolio =  await Portfolios.findOne({ chatId });
        console.log("portfolio", portfolio);
        if (portfolio) {
          portfolio.activeWalletIndex = 0;
          ctx.session.activeWalletIndex = portfolio.activeWalletIndex;
          await portfolio.save();  // Save the updated document to MongoDB
          await handleSettings(ctx);
          await RefreshAllWallets(ctx);
        }else{
          await ctx.api.sendMessage(chatId, "Error: Portfolio not found.");
        }

        break;
      case "select_wallet_1":
        const portfolio1 =  await Portfolios.findOne({ chatId });
        console.log("portfolio1", portfolio1);
     
        if (portfolio1) {
          portfolio1.activeWalletIndex = 1;
          ctx.session.activeWalletIndex = portfolio1.activeWalletIndex;

          await portfolio1.save();  // Save the updated document to MongoDB
          await handleSettings(ctx);
          await RefreshAllWallets(ctx);
        }else{
          await ctx.api.sendMessage(chatId, "Error: Portfolio not found.");
        }

        break;
      case "refresh_wallet":
        await handleRereshWallet(ctx);
        break;
      case "show_wallets":
        await handleWallets(ctx);
        break;
      case "refresh_db_wallets":
        await RefreshAllWallets(ctx);
        break;

      case "delete_wallet": {
        await resetWallet(ctx);
        break;
      }
      case "refresh_wallet":
        await handleRereshWallet(ctx);
        break;

      case "refresh_trade":
        await display_token_details(ctx, true);
        break;
      case "delete_wallet":
        await resetWallet(ctx);
        break;
      case "refresh_snipe":
        await display_snipe_options(ctx, true);
        break;
      case "import_wallet": {
        ctx.session.latestCommand = "import_wallet";
        const allowed = await checkWalletsLength(ctx);
        if (allowed) {
          await ctx.api.sendMessage(
            chatId,
            "Please enter your private/secret key."
          );
        }
        break;
      }
      case "help":
        await sendHelpMessage(ctx);
        break;
      case "create_new_wallet":
        const allowed = await checkWalletsLength(ctx);

        if (allowed) {
          await createNewWallet(ctx);
        }

        break;
      case "settings":
        await handleSettings(ctx);
        break;
      case "get_private_key":
        await handleGetPrivateKey(ctx);
        break;
      case "cancel_reset_wallet":
        await handleCloseKeyboard(ctx);
        break;
      case "confirm_reset_wallet":
        await confirmResetWalletAgain(ctx);
        break;
      case "closing":
        await handleCloseKeyboard(ctx);
        break;
      case "confirm_send_sol": {
        const recipientAddress = ctx.session.recipientAddress;
        const solAmount = ctx.session.solAmount;
        await ctx.api.sendMessage(
          chatId,
          `Sending ${solAmount} SOL to ${recipientAddress}...`
        );
        await sendSol(ctx, recipientAddress, solAmount);
        break;
      }
      case "rug_check": {
        ctx.session.latestCommand = "rug_check";
        ctx.api.sendMessage(
          chatId,
          "Please provide the token address for a rug pull analysis."
        );
        break;
      }
      case "sell": {
        ctx.session.latestCommand = "sell";
        const referralRecord = await Referrals.findOne({
          referredUsers: chatId,
        });
        if (referralRecord) {
          ctx.session.referralCommision = referralRecord.commissionPercentage;
          ctx.session.generatorWallet = referralRecord.generatorWallet;
        }

        await ctx.api.sendMessage(
          chatId,
          "Enter the token Address you would like to sell."
        );
        // }
        break;
      }
      case "buy": {
        const referralRecord = await Referrals.findOne({
          referredUsers: chatId,
        });
        if (referralRecord) {
          ctx.session.referralCommision = referralRecord.commissionPercentage;
          ctx.session.generatorWallet = referralRecord.generatorWallet;
          // console.log('ctx.session.referralCommision', ctx.session.referralCommision);
        }
        if (ctx.session.latestCommand === 'rug_check') {
          ctx.session.latestCommand = "buy";
          await display_token_details(ctx, false);
        }else if(ctx.session.latestCommand === 'optional'){
          ctx.session.latestCommand = "buy";
          // ctx.session.snipeToken = ctx.session.latestToken;
          ctx.session.activeTradingPool = await getRayPoolKeys(ctx, ctx.session.latestToken);
          await display_token_details(ctx,false);
        } else {
          ctx.session.latestCommand = "buy";
          await ctx.api.sendMessage(
            chatId,
            "Enter the token Address you would like to Buy."
          );
        }

        break;
      }
      case "snipe": {
        ctx.session.snipeStatus = true;
        const referralRecord = await Referrals.findOne({ referredUsers: chatId });
        if (referralRecord) {
          ctx.session.referralCommision = referralRecord.commissionPercentage;
          ctx.session.generatorWallet = referralRecord.generatorWallet;
        }

        if (ctx.session.latestCommand === 'rug_check') {
          ctx.session.latestCommand = "snipe";
          await display_snipe_options(ctx,false, ctx.session.rugCheckToken);
        } else if(ctx.session.latestCommand === 'optional'){
          ctx.session.latestCommand = "snipe";
          ctx.session.snipeToken = ctx.session.latestToken;
          ctx.session.activeTradingPool = await getRayPoolKeys(ctx, ctx.session.latestToken);
          await display_snipe_options(ctx,false, ctx.session.snipeToken);
        }
        else {
          ctx.session.latestCommand = "snipe";
          await ctx.api.sendMessage(
            ctx.chat.id,
            "Enter the token Address you would like to snipe."
          );
        }

        break;
      }
      case "cancel_snipe": {
        ctx.session.snipeStatus = false;
        await ctx.api.sendMessage(chatId, "Sniper cancelled.");
        console.log("cancel_snipe.", ctx.session.snipeStatus);
        break;
      }
      case "set_slippage": {
        ctx.session.latestCommand = "set_slippage";
        ctx.api.sendMessage(chatId, "Please enter slippage % amount");
        break;
      }
      case "set_snipe_slippage": {
        ctx.session.latestCommand = "set_snipe_slippage";
        ctx.api.sendMessage(chatId, "Please enter slippage % amount");
        break;
      }
      case "send_sol": {
        ctx.session.latestCommand = "send_sol";
        ctx.api.sendMessage(
          chatId,
          "Please paste the recipient's wallet address."
        );
        break;
      }


      case "buy_0.1_SOL":
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "buy",
          "0.1"
        );
        break;
      case "buy_0.2_SOL":
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "buy",
          "0.2"
        );
        break;
      case "buy_0.5_SOL":
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "buy",
          "0.5"
        );
        break;
      case "buy_1_SOL":
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "buy",
          "1"
        );
        break;
      case "buy_5_SOL":
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "buy",
          "5"
        );
        break;
      case "buy_X_SOL": {
        ctx.session.latestCommand = "buy_X_SOL";
        ctx.api.sendMessage(chatId, "Please enter SOL amount");
        break;
      }
      case "sell_10_TOKEN":
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "sell",
          "10"
        );
        break;
      case "sell_25_TOKEN":
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "sell",
          "25"
        );
        break;
      case "sell_30_TOKEN":
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "sell",
          "30"
        );
        break;
      case "sell_50_TOKEN":
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "sell",
          "50"
        );
        break;
      case "sell_75_TOKEN":
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "sell",
          "75"
        );
        break;
      case "sell_100_TOKEN":
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "sell",
          "100"
        );
        break;
      case "sell_X_TOKEN": {
        ctx.session.latestCommand = "sell_X_TOKEN";
        ctx.api.sendMessage(chatId, "Please enter amount to sell.");
        break;
      }
      case "snipe_0.1_SOL": {
        ctx.session.snipeStatus = true;
        if (ctx.session.snipperLookup) {
          await snipperON(ctx, "0.1");
        } else {
          await setSnipe(ctx, "0.1");
        }
        break;
      }
      case "snipe_0.2_SOL": {
        ctx.session.snipeStatus = true;
        if (ctx.session.snipperLookup) {
          await snipperON(ctx, "0.2");
        } else {
          await setSnipe(ctx, "0.2");
        }
        break;
      }
      case "snipe_0.5_SOL": {
        ctx.session.snipeStatus = true;
        if (ctx.session.snipperLookup) {
          await snipperON(ctx, "0.5");
        } else {
          await setSnipe(ctx, "0.5");
        }
        break;
      }
      case "snipe_1_SOL": {
        ctx.session.snipeStatus = true;
        if (ctx.session.snipperLookup) {
          await snipperON(ctx, "1");
        } else {
          await setSnipe(ctx, "1");
        }
        break;
      }
      case "snipe_5_SOL": {
        ctx.session.snipeStatus = true;
        if (ctx.session.snipperLookup) {
          await snipperON(ctx, "5");
        } else {
          await setSnipe(ctx, "5");
        }
        break;
      }
      case "snipe_X_SOL": {
        ctx.session.snipeStatus = true;
        ctx.session.latestCommand = "snipe_X_SOL";
        ctx.api.sendMessage(chatId, "Please enter amount to snipe.");
        break;
      }
      case "display_spl_positions": {
        // await ctx.api.sendMessage(ctx.chat.id, `Loading your positions...`);
        await display_spl_positions(ctx,false);
        break;
      }
      case "display_refresh_single_spl_positions": {
        await display_single_spl_positions(ctx, true);
        await display_single_spl_positions(ctx, true);
        break;
      }
      case "Refresh_display_after_Snipe_Buy": {
        await display_after_Snipe_Buy(ctx, true);
        break;
      }
      case "display_single_spl_positions": {
        ctx.session.latestCommand = 'display_single_spl_positions'
        await display_single_spl_positions(ctx, false);
        break;
      }
      case "priority_low": {
        console.log("LOW ")
        ctx.session.priorityFees = PriotitizationFeeLevels.LOW;
        if (ctx.session.latestCommand === "snipe") {
          await display_snipe_options(ctx, true);
        } else if (ctx.session.latestCommand === 'display_single_spl_positions') {
          await display_single_spl_positions(ctx, true);

        } else if (ctx.session.latestCommand === 'display_after_Snipe_Buy') {
          await display_after_Snipe_Buy(ctx, true);

        }
        else {
          await display_token_details(ctx, true);
        }
        break;
      }
      case "priority_medium": {
        console.log("MED ")
        ctx.session.priorityFees = PriotitizationFeeLevels.MEDIUM;
        if (ctx.session.latestCommand === "snipe") {
          await display_snipe_options(ctx, true);
        } else if (ctx.session.latestCommand === 'display_single_spl_positions') {
          await display_single_spl_positions(ctx, true);
        } else if (ctx.session.latestCommand === 'display_after_Snipe_Buy') {
          await display_after_Snipe_Buy(ctx,true);

        }
        else {
          await display_token_details(ctx, true);
        }
        break;
      }
      case "priority_high": {
        console.log("HIGH ")
        ctx.session.priorityFees = PriotitizationFeeLevels.HIGH;
        if (ctx.session.latestCommand === "snipe") {
          await display_snipe_options(ctx, true);
        } else if (ctx.session.latestCommand === 'display_single_spl_positions') {
          await display_single_spl_positions(ctx, true);
        } else if (ctx.session.latestCommand === 'display_after_Snipe_Buy') {
          await display_after_Snipe_Buy(ctx, true);

        }
        else {
          await display_token_details(ctx, true);
        }
        break;
      }
      case "priority_max": {
        console.log("MAX")
        ctx.session.priorityFees = PriotitizationFeeLevels.MAX;
        if (ctx.session.latestCommand === "snipe") {
          await display_snipe_options(ctx, true);
        } else if (ctx.session.latestCommand === 'display_single_spl_positions') {
          await display_single_spl_positions(ctx, true);
        } else if (ctx.session.latestCommand === 'display_after_Snipe_Buy') {
          await display_after_Snipe_Buy(ctx, true);

        }
        else {
          await display_token_details(ctx, true);
        }
        break;
      }
    }
  } catch (e: any) {
    logErrorToFile("callback_query", e);

    if (e instanceof GrammyError || e instanceof HttpError || e instanceof Error || e instanceof TypeError || e instanceof RangeError) {
      console.error("Callback query failed due to timeout or invalid ID.");

    }
    else {
      console.error(e);
    }
  }
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    logErrorToFile("GrammyError bot.catch((err)", e);
    console.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    logErrorToFile("HttpError bot.catch((err)", e);
    console.error("Could not contact Telegram:", e);
  } else {
    logErrorToFile("Unknown bot.catch((err)", e);
    console.error("Unknown error:", e);
  }
});

async function checkAccountType(ctx: any, address: any) {
  const connection = new Connection(
    `${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`
  );
  const publicKey = new PublicKey(address);
  const TOKEN_PROGRAM_ID = new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  );

  try {
    const accountInfo = await connection.getAccountInfo(publicKey);
    if (accountInfo) {
      return accountInfo.owner.equals(TOKEN_PROGRAM_ID);
    } else {
      console.log("Account not found");
      return false;
    }
  } catch (error) {
    console.error("Error in fetching account info:", error);
    return false;
  }
}
process.on('uncaughtException', (err, origin) => {
  console.error(`Caught exception: ${err}\n` +
    `Exception origin: ${origin}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});