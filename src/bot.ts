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
  RAYDIUM_POOL_TYPE,
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
  display_after_Snipe_Buy,
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
import {
  Portfolios,
  Referrals,
  AllowedReferrals,
  UserSession,
} from "./db/mongo/schema";

import { PriotitizationFeeLevels } from "../src/service/fees/priorityFees";
import { display_pumpFun } from "./views/pumpFun/pumpFunView";
import { swap_pump_fun } from "./views/pumpFun/pumpFunView";
import { setCustomPriority } from "./views/util/getPriority";
import {
  display_jupSwapDetails,
  jupiterSwap,
} from "./views/jupiter/jupiterSwapView";
import {
  display_all_positions,
  display_single_position,
} from "./views/new_portfolioView";
import { get } from "axios";

const express = require("express");
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
  if (messageTimestamp && currentTimestamp - messageTimestamp > threshold) {
    console.error(
      "This message was sent while I was offline and is now too old. Please resend your message if it's still relevant."
    );
  } else {
    return next();
  }
});

/*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
/*                  BOT WEBHOOK                              */
/*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/

const botToken = process.env.TELEGRAM_BOT_TOKEN!;
const port = process.env.PORT || 80;
let backupSession: ISESSION_DATA;

if (isProd) {
  const webhookUrl = "https://drib.ngrok.app";
  const url = `${webhookUrl}/${botToken}`;
  // Create the HTTP server and define request handling logic
  app.use(express.json()); // for parsing application/json
  app.post(`/${botToken}`, webhookCallback(bot, "express"));
  app.use(`/${botToken}`, webhookCallback(bot, "express"));
  app.get("/", (req: any, res: any) => {
    res.send("Hello from ngrok server!");
  });
  app.listen(port, async () => {
    console.log(`Server is running on port ${port}`);
    await bot.api
      .setWebhook(url)
      .then(() => console.log("Webhook set successfully"))
      .catch((err) => console.error("Error setting webhook:", err));
  });
} else {
  bot.start();
}

async function _validateSession(ctx: any) {
  if (JSON.parse(JSON.stringify(ctx.session)).chatId == 0) {
    const restoredSession = await UserSession.findOne({ chatId: ctx.chat.id });
    if (restoredSession) {
      // NOTE: update db manually, if schema changes! avoid stopping the bot
      ctx.session = JSON.parse(JSON.stringify(restoredSession));
      console.log("Session restored.");
    }
  }
}

/*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
/*                      BOT START                             */
/*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
bot.command("start", async (ctx: any) => {
  await _validateSession(ctx);
  backupSession = ctx.session;

  try {
    const chatId = ctx.chat.id;
    ctx.session.chatId = chatId;
    const portfolio: PORTFOLIO_TYPE = await getPortfolio(chatId); // returns portfolio from db if true
    let isNewUser = false;
    const connection = new Connection(
      `${ctx.session.tritonRPC}${ctx.session.tritonToken}`
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

    const user = await AllowedReferrals.find({ tgUserName: userName });
    if (user[0] != undefined) {
      ctx.session.allowedReferral = user[0].tgUserName;
    }
    // console.log("referralCode:", referralCode);
    if (referralCode || ctx.session.allowedReferral) {
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
      ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex] =
        userWallet;
    }
    const publicKeyString: PublicKey | String = userWallet
      ? userWallet.publicKey
      : ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex]
        .publicKey;

    // Retrieve the current SOL details
    let solPriceMessage = "";
    const [balanceInSOL, details] = await Promise.all([
      getSolBalance(publicKeyString, connection),
      getSolanaDetails(),
    ]);

    // Fetch SOL balance
    if (balanceInSOL === null) {
      await ctx.api.sendMessage(chatId, "Error fetching wallet balance.");
      return;
    }

    // solana price
    if (details) {
      const solData = details;
      solPriceMessage = `\n\SOL Price: <b>${solData}</b> USD`;
    } else {
      solPriceMessage = "\nError fetching current SOL price.";
    }

    // Combine the welcome message, SOL price message, and instruction to create a wallet
    const welcomeMessage =
      `✨ Welcome to <b>DRIBs bot</b>✨\n` +
      `Begin by extracting your wallet's private key. Then, you're all set to start trading!\n` +
      `Choose from two wallets: start with the default one or import yours using the "Import Wallet" button.\n` +
      // `We're always working to bring you new features - stay tuned!\n\n` +
      `Your Wallet: <code><b>${publicKeyString}</b></code>\n` +
      `Balance: <b>${balanceInSOL.toFixed(4)}</b> SOL | <b>${(
        balanceInSOL * details
      ).toFixed(4)}</b> USD\n\n` +
      `🖐🏼 For security, we recommend exporting your private key and keeping it paper.\n` +
      `<i> Currently DRIBs bot supports Jupiter, Raydium and Pump fun.</i>\n`;

    // Set the options for th e inline keyboard with social links
    const options: any = {
      reply_markup: JSON.stringify({
        inline_keyboard: [
          // [
          //     { text: '🌎 Website', url: 'https://dribs.io/' },
          //     { text: '𝚇', url: 'https://twitter.com/dribs_sol' }

          // ],
          [
            { text: "⬇️ Import Wallet", callback_data: "import_wallet" },
            { text: "💼 Wallets & Settings⚙️", callback_data: "show_wallets" },
          ],
          [{ text: "☑️ Rug Check", callback_data: "rug_check" }],
          [
            { text: "💱 Trade", callback_data: "jupiter_swap" },
            { text: "🎯 Turbo Snipe", callback_data: "snipe" },
          ],

          [
            { text: "ℹ️ Help", callback_data: "help" },
            { text: "Refer Friends", callback_data: "refer_friends" },
          ],
          [{ text: "Positions", callback_data: "display_all_positions" }],
          [{ text: "🔄 Refresh", callback_data: "refresh_start" }],
        ],
      }),
      parse_mode: "HTML",
    };
    // Send the message with the inline keyboard
    ctx.api.sendMessage(chatId, ` ${welcomeMessage}`, options);
    ctx.session.portfolio = await getPortfolio(chatId);
    ctx.session.latestCommand = "jupiter_swap";
  } catch (error: any) {
    console.log("bot on start cmd", error);

    if (
      error instanceof GrammyError ||
      error instanceof HttpError ||
      error instanceof Error ||
      error instanceof TypeError ||
      error instanceof RangeError
    ) {
      console.error(
        "Callback query failed due to timeout or invalid ID.",
        error
      );
    } else {
      console.error(error.message);
    }
  }
});

bot.command("help", async (ctx) => {
  await sendHelpMessage(ctx);
  ctx.session.latestCommand = "jupiter_swap";
});

bot.command("positions", async (ctx) => {
  await _validateSession(ctx);
  backupSession = ctx.session;

  try {
    // await ctx.api.sendMessage(ctx.chat.id, `Loading your positions...`);
    await display_all_positions(ctx, false);
  } catch (error: any) {
    console.log("bot on positions cmd", error);
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
    console.log("bot on rugchecking cmd", error);
  }
});

bot.command("trade", async (ctx) => {
  await _validateSession(ctx);
  backupSession = ctx.session;
  try {
    const chatId = ctx.chat.id;
    const referralRecord = await Referrals.findOne({ referredUsers: chatId });
    if (referralRecord) {
      ctx.session.referralCommision = referralRecord.commissionPercentage;
      ctx.session.generatorWallet = new PublicKey(
        referralRecord.generatorWallet
      );
    }
    ctx.session.latestCommand = "jupiter_swap";
  ctx.api.sendMessage( ctx.chat.id,'Please enter the token address you would like to trade.');
    // }
  } catch (error: any) {
    console.log("bot on sell cmd", error);
  }
});
bot.command("snipe", async (ctx) => {
  await _validateSession(ctx);
  backupSession = ctx.session;
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
    console.log("bot on snipe cmd", error);
  }
});

bot.command("settings", async (ctx) => {
  await _validateSession(ctx);
  backupSession = ctx.session;
  try {
    await handleSettings(ctx);
  } catch (error: any) {
    console.log("bot.command('settings',", error);
  }
});

/*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
/*                      BOT ON MSG                            */
/*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
const commandNumbers = [
  "buy_X_JUP",
  "sell_X_JUP",
  "set_slippage",
  "set_snipe_slippage",
  "buy_0.5_JUP",
  "sell_0.5_JUP",
  "buy_1_JUP",
  "sell_1_JUP",
  "ask_for_sol_amount",
  "send_sol",
  "buy_X_PUMP",
  "sell_X_PUMP",
  "sell_0.5_PUMP",
  "sell_1_PUMP",
  "set_customPriority",
  "buy_X_RAY",
  "sell_x_RAY",
  "buy_0.5_RAY",
  "sell_0.5_RAY",
  "buy_1_RAY",
  "sell_1_RAY",
  "buy_X_SOL_IN_POSITION",
  "rug_check",
  'snipe_X_SOL'

  // 'jupiter_swap',
];

bot.on("message", async (ctx) => {
  await _validateSession(ctx);
  backupSession = ctx.session;
  const chatId = ctx.chat.id;
  try {
    ctx.session.portfolio.chatId = chatId;
    const latestCommand = ctx.session.latestCommand;
    const msgTxt = ctx.update.message.text;
    if (msgTxt && !commandNumbers.includes(latestCommand)) {
      const pumpRegex = /https:\/\/(www\.)?pump\.fun\/([A-Za-z0-9]+)/;
      const birdEyeRegex =
        /https:\/\/(www\.)?birdeye\.so\/token\/([A-Za-z0-9]+)\?chain=solana/;
      const match_pump = msgTxt.match(pumpRegex);
      const match_birdEye = msgTxt.match(birdEyeRegex);

      if (match_pump) {
        ctx.session.latestCommand = "jupiter_swap";
        let jupToken = match_pump[2];
        ctx.session.jupSwap_token = jupToken;
        await display_jupSwapDetails(ctx, false);
        return;
      } else if (match_birdEye) {
        ctx.session.latestCommand = "jupiter_swap";
        let jupToken = match_birdEye[2];
        ctx.session.jupSwap_token = jupToken;
        await display_jupSwapDetails(ctx, false);
        return;
      }

      if (!isNaN(parseFloat(msgTxt!))) {
        if (
          (msgTxt && PublicKey.isOnCurve(msgTxt)) ||
          (msgTxt && !PublicKey.isOnCurve(msgTxt))
        ) {
          const isTOken = await checkAccountType(ctx, msgTxt);
          if (!isTOken) {
            ctx.api.sendMessage(chatId, "Invalid address");
            return;
          }
          ctx.session.latestCommand = "jupiter_swap";
          ctx.session.jupSwap_token = msgTxt;
          // await display_jupSwapDetails(ctx, false);
        } else {
          ctx.api.sendMessage(chatId, "Invalid address");
        }
      }
    }
    switch (latestCommand) {
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
        await display_snipe_options(ctx, false, snipeToken);
        break;
      }
      case "rug_check": {
        if (msgTxt) {
          if (
            (msgTxt && PublicKey.isOnCurve(msgTxt)) ||
            (msgTxt && !PublicKey.isOnCurve(msgTxt))
          ) {
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

      case "jupiter_swap": {
        if (msgTxt) {
          if (
            !ctx.session.jupSwap_token ||
            (msgTxt && PublicKey.isOnCurve(msgTxt)) ||
            (msgTxt && !PublicKey.isOnCurve(msgTxt))
          ) {
            const isToken = msgTxt
              ? await checkAccountType(ctx, msgTxt)
              : await checkAccountType(ctx, ctx.session.jupSwap_token);
            if (!isToken) {
              ctx.api.sendMessage(chatId, "Invalid address");
              return;
            }
            ctx.session.latestCommand = "jupiter_swap";
            ctx.session.jupSwap_token = msgTxt;

            await display_jupSwapDetails(ctx, false);
          } else {
            ctx.api.sendMessage(chatId, "Invalid address");
          }
        }
        break;
      }

      case "buy_X_PUMP": {
        ctx.session.latestCommand = "buy_X_PUMP";
        if (msgTxt) {

          const isNumeric = /^[0-9]+(\.[0-9]+)?$/.test(msgTxt);

          if (isNumeric) {
            const amt = Number(msgTxt);
            if (!isNaN(amt)) {
              ctx.session.pump_amountIn = amt;
              console.log("ctx.session.pump_amountIn", ctx.session.pump_amountIn);

              ctx.session.pump_side = "buy";
              await swap_pump_fun(ctx);
              break;
            } else {
              return await ctx.api.sendMessage(chatId, "🔴 Invalid amount");
            }
          } else {
            return await ctx.api.sendMessage(chatId, "🔴 Invalid amount");
          }
        }
      }
      case "buy_X_JUP": {
        ctx.session.latestCommand = "buy_X_JUP";
        if (msgTxt) {

          const isNumeric = /^[0-9]+(\.[0-9]+)?$/.test(msgTxt);

          if (isNumeric) {
            const amt = Number(msgTxt);

            if (!isNaN(amt)) {

              // console.log("ctx.session.pump_amountIn", ctx.session.pump_amountIn);
              ctx.session.jupSwap_amount = amt;
              ctx.session.jupSwap_side = "buy";
              await jupiterSwap(ctx);
              break;
            } else {
              return await ctx.api.sendMessage(chatId, "🔴 Invalid amount");
            }
          } else {
            return await ctx.api.sendMessage(chatId, "🔴 Invalid amount");
          }

        }
      }
      case "sell_X_PUMP": {
        ctx.session.latestCommand = "sell_X_PUMP";
        if (msgTxt) {
          const amt = msgTxt.includes(".")
            ? Number.parseFloat(msgTxt)
            : Number.parseInt(msgTxt);
          if (!isNaN(amt) && amt >= 0 && amt <= 100) {
            // console.log('ctx.session.pump_amountIn', ctx.session.pump_amountIn)
            ctx.session.pump_amountIn = amt;
            ctx.session.pump_side = "sell";
            await swap_pump_fun(ctx);
            break;
          } else {
            return await ctx.api.sendMessage(
              chatId,
              "🔴 Invalid amount. Please enter a number between 0 and 100 to represent the percentage."
            );
          }
        }
        break;
      }
      case "sell_X_JUP": {
        ctx.session.latestCommand = "sell_X_JUP";
        if (msgTxt) {
          const amt = msgTxt.includes(".")
            ? Number.parseFloat(msgTxt)
            : Number.parseInt(msgTxt);
          if (!isNaN(amt) && amt >= 0 && amt <= 100) {
            ctx.session.jupSwap_amount = amt;
            ctx.session.jupSwap_side = "sell";
            await jupiterSwap(ctx);
            break;
          } else {
            return await ctx.api.sendMessage(
              chatId,
              "🔴 Invalid amount. Please enter a number between 0 and 100 to represent the percentage."
            );
          }
        }
        break;
      }

      case "buy_X_RAY":
        console.log("buy_X_RAY here");
        ctx.session.latestCommand = "buy_X_RAY";
        if (msgTxt) {
          const amt = msgTxt.includes(".")
            ? Number.parseFloat(msgTxt)
            : Number.parseInt(msgTxt);
          if (!isNaN(amt)) {
            await handle_radyum_swap(
              ctx,
              ctx.session.activeTradingPool.baseMint,
              "buy",
              Number(msgTxt)
            );
            break;
          } else {
            return await ctx.api.sendMessage(chatId, "🔴 Invalid amount");
          }
        }
      // just to solve the position refresh problem temporarly
      case "buy_X_SOL_IN_POSITION":
        ctx.session.latestCommand = "display_single_position";
        if (msgTxt) {
          // Check if msgTxt is a numeric value
          const isNumeric = /^\d+(\.\d+)?$/.test(msgTxt);

          if (isNumeric) {
            const amt = Number(msgTxt);
            if (!isNaN(amt)) {
              if (ctx.session.swaptypeDex == "ray_swap") {
                const poolkey = await getRayPoolKeys(
                  ctx,
                  ctx.session.positionPool[ctx.session.positionIndex]
                );
                ctx.session.activeTradingPool = poolkey as RAYDIUM_POOL_TYPE;
                await handle_radyum_swap(
                  ctx,
                  ctx.session.activeTradingPool.baseMint,
                  "buy",
                  Number(msgTxt)
                );
              } else if (ctx.session.swaptypeDex == "jup_swap") {
                ctx.session.jupSwap_amount = amt;
                ctx.session.jupSwap_side = "buy";
                await jupiterSwap(ctx);
              } else {
                const poolKeys = await getRayPoolKeys(
                  ctx,
                  ctx.session.positionPool[ctx.session.positionIndex]
                );
                if (poolKeys) {
                  ctx.session.activeTradingPool = poolKeys as RAYDIUM_POOL_TYPE;
                  await handle_radyum_swap(
                    ctx,
                    ctx.session.activeTradingPool.baseMint,
                    "buy",
                    Number(msgTxt)
                  );
                } else {
                  ctx.session.pumpToken = new PublicKey(
                    ctx.session.positionPool[ctx.session.positionIndex]
                  );
                  ctx.session.pump_amountIn = amt;
                  ctx.session.pump_side = "buy";
                  await swap_pump_fun(ctx);
                }
              }

              break;
            } else {
              return await ctx.api.sendMessage(chatId, "🔴 Invalid amount");
            }
          } else {
            return await ctx.api.sendMessage(chatId, "🔴 Invalid amount");
          }
        }
      case "sell_X_RAY":
        ctx.session.latestCommand = "sell_X_RAY";

        if (msgTxt) {
          const amt = msgTxt.includes(".")
            ? Number.parseFloat(msgTxt)
            : Number.parseInt(msgTxt);
          if (!isNaN(amt)) {
            await handle_radyum_swap(
              ctx,
              ctx.session.activeTradingPool.baseMint,
              "sell",
              Number(msgTxt)
            );
            break;
          } else {
            return await ctx.api.sendMessage(chatId, "🔴 Invalid amount");
          }
        }
        break;
      case "snipe_X_SOL": {
        ctx.session.latestCommand = "snipe_X_SOL";
        if (msgTxt) {
          const amt = msgTxt.includes(".")
            ? Number.parseFloat(msgTxt)
            : Number.parseInt(msgTxt);
          if (!isNaN(amt)) {
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

      case "snipe": {
        ctx.session.snipeStatus = true;
        try {
          if (
            (msgTxt && PublicKey.isOnCurve(msgTxt)) ||
            (msgTxt && !PublicKey.isOnCurve(msgTxt))
          ) {
            const isTOken = await checkAccountType(ctx, msgTxt);
            if (!isTOken) {
              ctx.api.sendMessage(chatId, "Invalid address");
              return;
            }

            ctx.session.activeTradingPool = await getRayPoolKeys(ctx, msgTxt);
            if (!ctx.session.activeTradingPool) {
              ctx.session.snipperLookup = true;
              ctx.session.snipeToken = new PublicKey(msgTxt);
              await display_snipe_options(ctx, false, msgTxt);
            } else {
              ctx.session.snipeToken = new PublicKey(
                ctx.session.activeTradingPool.baseMint
              );

              display_snipe_options(
                ctx,
                false,
                ctx.session.snipeToken.toBase58()
              );
            }
          } else if (
            (msgTxt && PublicKey.isOnCurve(msgTxt)) ||
            (msgTxt && !PublicKey.isOnCurve(msgTxt))
          ) {
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
          const [referralData, details] = await Promise.all([
            await _getReferralData(ctx),
            await getSolanaDetails(), // Fetch referral data
          ]);

          const referEarningSol = (
            Number(referralData?.totalEarnings) / 1e9
          ).toFixed(6);

          const referEarningDollar = (
            Number(referEarningSol) * details
          ).toFixed(2);
          let responseMessage =
            `<b>Referral Program Details</b>\n\n` +
            `🔗 <b>Your Referral Link:</b> ${referralLink}\n\n` +
            `👥 <b>Referrals Count:</b> ${referralData?.count}\n` +
            `💰 <b>Total Earnings:</b> ${referEarningSol} SOL ($${referEarningDollar})\n` +
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
      case "set_customPriority": {
        if (msgTxt) {
          // convert the string to an integer
          const priority = parseFloat(msgTxt);
          if (!isNaN(priority)) {
            ctx.session.customPriorityFee = priority;
            await setCustomPriority(ctx);
            break;
          } else {
            console.error("Invalid input: Please enter a valid number");
          }
        }
        break;
      }
    }
  } catch (error: any) {
    await ctx.api.sendMessage(chatId, `${error.message})`);
    console.error("ERROR on bot.on txt msg", error, error.message);
    console.log("bot.on('message'", error);
  }
});

/*«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-«-*/
/*                      BOT ON CALLBACK                       */
/*-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»-»*/
bot.on("callback_query", async (ctx: any) => {
  await _validateSession(ctx);
  backupSession = ctx.session;
  const chatId = ctx.chat.id;
  try {
    ctx.session.portfolio.chatId = chatId;
    const data = ctx.callbackQuery.data;
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
      if (ctx.session.swaptypeDex == "ray_swap") {
        const poolKeys = await getRayPoolKeys(
          ctx,
          ctx.session.positionPool[positionIndex]
        );
        ctx.session.activeTradingPool = poolKeys as RAYDIUM_POOL_TYPE;
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "sell",
          sellPercentage
        );
        return;
      } else if (ctx.session.swaptypeDex == "jup_swap") {
        ctx.session.jupSwap_token = ctx.session.positionPool[positionIndex];
        // ctx.session.latestCommand = "sell_100_JUP";
        ctx.session.jupSwap_amount = sellPercentage;
        ctx.session.jupSwap_side = "sell";
        await jupiterSwap(ctx);
      } else {
        const poolKeys = await getRayPoolKeys(
          ctx,
          ctx.session.positionPool[positionIndex]
        );
        if (poolKeys) {
          ctx.session.activeTradingPool = poolKeys as RAYDIUM_POOL_TYPE;
          await handle_radyum_swap(
            ctx,
            ctx.session.activeTradingPool.baseMint,
            "sell",
            sellPercentage
          );
        } else {
          ctx.session.pumpToken = new PublicKey(
            ctx.session.positionPool[positionIndex]
          );
          ctx.session.pump_amountIn = sellPercentage;
          ctx.session.pump_side = "sell";
          await swap_pump_fun(ctx);
        }
      }
      return;
    } else if (matchBuy) {
      const parts = data.split("_");
      const positionIndex = parts[2]; // Position index
      ctx.session.activeTradingPool = ctx.session.positionPool[positionIndex];
      ctx.api.sendMessage(chatId, "Please enter SOL amount");
      ctx.session.latestCommand = "buy_X_SOL_IN_POSITION";

      return;
    } else if (matchNavigate) {
      const parts = data.split("_");
      const newPositionIndex = parseInt(parts[2]); // New position index
      ctx.session.positionIndex = newPositionIndex;
      ctx.session.jupSwap_token =
        ctx.session.positionPool[ctx.session.positionIndex].baseMint;
      await display_single_position(ctx, true);
    }

    switch (data) {
      case "refer_friends": {
        const chatId = ctx.chat.id;
        const username = ctx.update.callback_query.from.username; //ctx.from.username;

        // Check if the user is allowed to access the referral program
        if (ctx.session.allowedReferral) {
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
              `💰 <b>Total Earnings:</b> ${referEarningSol} SOL ($${referEarningDollar})\n` +
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
        await display_all_positions(ctx, true);
        break;
      case "refrech_rug_check":
        let isRefresh = true;
        await display_rugCheck(ctx, isRefresh);
        break;

      case "refresh_pump_fun":
        await display_pumpFun(ctx, true);
        break;

      case "refresh_Jupiter_swap":
        await display_jupSwapDetails(ctx, true);
        break;

      case "select_wallet_0":
        const portfolio = await Portfolios.findOne({ chatId });
        if (portfolio) {
          portfolio.activeWalletIndex = 0;
          ctx.session.portfolio.activeWalletIndex = portfolio.activeWalletIndex;
          await portfolio.save(); // Save the updated document to MongoDB
          await handleSettings(ctx);
          await RefreshAllWallets(ctx);
        } else {
          await ctx.api.sendMessage(chatId, "Error: Portfolio not found.");
        }

        break;
      case "select_wallet_1":
        const portfolio1 = await Portfolios.findOne({ chatId });
        console.log("portfolio1", portfolio1);
        if (portfolio1) {
          portfolio1.activeWalletIndex = 1;
          ctx.session.portfolio.activeWalletIndex =
            portfolio1.activeWalletIndex;

          await portfolio1.save(); // Save the updated document to MongoDB
          await handleSettings(ctx);
          await RefreshAllWallets(ctx);
        } else {
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
      case "jupiter_swap": {
        if (ctx.session.latestCommand === "rug_check") {
          ctx.session.jupSwap_token = ctx.session.rugCheckToken.toBase58();
          ctx.session.latestCommand = "jupiter_swap";

          await display_jupSwapDetails(ctx, false);
        } else if (!ctx.session.jupSwap_token) {
          ctx.session.latestCommand = "jupiter_swap";
          ctx.api.sendMessage(
            chatId,
            "Please provide the token address or the jupiter swap link."
          );
        } else {
          ctx.session.latestCommand = "jupiter_swap";
          await display_jupSwapDetails(ctx, false);
        }
        break;
      }

      case "snipe": {
        ctx.session.snipeStatus = true;
        const referralRecord = await Referrals.findOne({
          referredUsers: chatId,
        });
        if (referralRecord) {
          ctx.session.referralCommision = referralRecord.commissionPercentage;
          ctx.session.generatorWallet = referralRecord.generatorWallet;
        }

        if (ctx.session.latestCommand === "rug_check") {
          ctx.session.latestCommand = "snipe";
          await display_snipe_options(ctx, false, ctx.session.rugCheckToken);
        } else {
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
      case "buy_X_PUMP": {
        ctx.session.latestCommand = "buy_X_PUMP";
        ctx.api.sendMessage(chatId, "Please enter SOL amount");
        break;
      }
      case "buy_0.5_PUMP": {
        ctx.session.latestCommand = "buy_X_PUMP";
        ctx.session.pump_amountIn = 0.5;
        ctx.session.pump_side = "buy";
        await swap_pump_fun(ctx);
        break;
      }
      case "buy_1_PUMP": {
        ctx.session.latestCommand = "buy_X_PUMP";
        ctx.session.pump_amountIn = 1;
        ctx.session.pump_side = "buy";
        await swap_pump_fun(ctx);
        break;
      }
      case "sell_X_PUMP": {
        ctx.session.latestCommand = "sell_X_PUMP";
        ctx.api.sendMessage(
          chatId,
          "Please enter x percentage to sell (eg. 25 for 25%)"
        );
        break;
      }
      case "sell_50_PUMP": {
        ctx.session.latestCommand = "sell_50_PUMP";
        ctx.session.pump_amountIn = 50;
        ctx.session.pump_side = "sell";
        await swap_pump_fun(ctx);
        break;
      }
      case "sell_100_PUMP": {
        ctx.session.latestCommand = "sell_100_PUMP";
        ctx.session.pump_amountIn = 100;
        ctx.session.pump_side = "sell";
        await swap_pump_fun(ctx);
        break;
      }
      case "buy_X_JUP": {
        ctx.session.latestCommand = "buy_X_JUP";
        ctx.api.sendMessage(chatId, "Please enter SOL amount");
        break;
      }
      case "buy_0.5_JUP":
        ctx.session.latestCommand = "buy_0.5_JUP";
        ctx.session.jupSwap_amount = 0.5;
        ctx.session.jupSwap_side = "buy";
        await jupiterSwap(ctx);
        break;

      case "buy_1_JUP":
        ctx.session.latestCommand = "buy_1_JUP";
        ctx.session.jupSwap_amount = 1;
        ctx.session.jupSwap_side = "buy";
        await jupiterSwap(ctx);
        break;
      case "sell_X_JUP": {
        ctx.session.latestCommand = "sell_X_JUP";
        ctx.api.sendMessage(
          chatId,
          "Please enter x percentage to sell (eg. 25 for 25%)"
        );
        break;
      }
      case "sell_50_JUP":
        ctx.session.latestCommand = "sell_50_JUP";
        ctx.session.jupSwap_amount = 50;
        ctx.session.jupSwap_side = "sell";
        await jupiterSwap(ctx);
        break;

      case "sell_100_JUP":
        ctx.session.latestCommand = "sell_100_JUP";
        ctx.session.jupSwap_amount = 100;
        ctx.session.jupSwap_side = "sell";
        await jupiterSwap(ctx);
        break;

      case "buy_0.5_RAY":
        ctx.session.latestCommand = "buy_0.5_RAY";
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "buy",
          "0.5"
        );
        break;

      case "buy_1_RAY":
        ctx.session.latestCommand = "buy_1_RAY";
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "buy",
          "1"
        );
        break;

      case "buy_X_RAY": {
        ctx.session.latestCommand = "buy_X_RAY";
        ctx.api.sendMessage(chatId, "Please enter SOL amount");
        break;
      }

      case "sell_50_RAY":
        ctx.session.latestCommand = "sell_50_RAY";
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "sell",
          "50"
        );
        break;

      case "sell_100_RAY":
        ctx.session.latestCommand = "sell_100_RAY";
        await handle_radyum_swap(
          ctx,
          ctx.session.activeTradingPool.baseMint,
          "sell",
          "100"
        );
        break;
      case "sell_X_RAY": {
        ctx.session.latestCommand = "sell_X_RAY";
        ctx.api.sendMessage(chatId, "Please enter amount to sell.");
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

      case "snipe_X_SOL": {
        ctx.session.snipeStatus = true;
        ctx.session.latestCommand = "snipe_X_SOL";
        ctx.api.sendMessage(chatId, "Please enter amount to snipe.");
        break;
      }
      case "display_all_positions": {
        // await ctx.api.sendMessage(ctx.chat.id, `Loading your positions...`);
        await display_all_positions(ctx, false);
        break;
      }
      case "display_refresh_single_spl_positions": {
        await display_single_position(ctx, true);

        break;
      }
      case "Refresh_display_after_Snipe_Buy": {
        await display_after_Snipe_Buy(ctx, true);
        break;
      }
      case "display_single_position": {
        ctx.session.latestCommand = "display_single_position";
        await display_single_position(ctx, false);
        break;
      }
      case "priority_low": {
        ctx.session.priorityFees = PriotitizationFeeLevels.LOW;
        ctx.session.ispriorityCustomFee = false;
        if (ctx.session.latestCommand === "snipe") {
          await display_snipe_options(ctx, true);
        } else if (ctx.session.latestCommand === "display_single_position") {
          await display_single_position(ctx, true);
        } else if (ctx.session.latestCommand === "display_after_Snipe_Buy") {
          await display_after_Snipe_Buy(ctx, true);
        } else if (ctx.session.latestCommand === "pump_fun") {
          await display_pumpFun(ctx, true);
        } else if (ctx.session.latestCommand === "jupiter_swap") {
          await display_jupSwapDetails(ctx, true);
        } else {
          await display_token_details(ctx, true);
        }
        break;
      }
      case "priority_medium": {
        ctx.session.priorityFees = PriotitizationFeeLevels.MEDIUM;
        ctx.session.ispriorityCustomFee = false;
        if (ctx.session.latestCommand === "snipe") {
          await display_snipe_options(ctx, true);
        } else if (ctx.session.latestCommand === "display_single_position") {
          await display_single_position(ctx, true);
        } else if (ctx.session.latestCommand === "display_after_Snipe_Buy") {
          await display_after_Snipe_Buy(ctx, true);
        } else if (ctx.session.latestCommand === "pump_fun") {
          await display_pumpFun(ctx, true);
        } else if (ctx.session.latestCommand === "jupiter_swap") {
          await display_jupSwapDetails(ctx, true);
        } else {
          await display_token_details(ctx, true);
        }
        break;
      }
      case "priority_high": {
        console.log("HIGH ");
        ctx.session.priorityFees = PriotitizationFeeLevels.HIGH;
        ctx.session.ispriorityCustomFee = false;
        if (ctx.session.latestCommand === "snipe") {
          await display_snipe_options(ctx, true);
        } else if (ctx.session.latestCommand === "display_single_position") {
          await display_single_position(ctx, true);
        } else if (ctx.session.latestCommand === "display_after_Snipe_Buy") {
          await display_after_Snipe_Buy(ctx, true);
        } else if (ctx.session.latestCommand === "pump_fun") {
          await display_pumpFun(ctx, true);
        } else if (ctx.session.latestCommand === "jupiter_swap") {
          await display_jupSwapDetails(ctx, true);
        } else {
          await display_token_details(ctx, true);
        }
        break;
      }
      case "priority_custom": {
        ctx.session.ispriorityCustomFee = true;
        if (ctx.session.latestCommand === "snipe") {
          await display_snipe_options(ctx, true);
        } else if (ctx.session.latestCommand === "display_single_position") {
          await display_single_position(ctx, true);
        } else if (ctx.session.latestCommand === "pump_fun") {
          await display_pumpFun(ctx, true);
        } else if (ctx.session.latestCommand === "jupiter_swap") {
          await display_jupSwapDetails(ctx, true);
        } else {
          await display_token_details(ctx, true);
        }
        break;
      }
      case "set_customPriority": {
        ctx.session.latestCommand = "set_customPriority";
        ctx.api.sendMessage(chatId, "Please enter custom priority fee in SOL");
        break;
      }
    }
  } catch (e: any) {
    console.log("callback_query", e);

    if (
      e instanceof GrammyError ||
      e instanceof HttpError ||
      e instanceof Error ||
      e instanceof TypeError ||
      e instanceof RangeError
    ) {
      console.error("Callback query failed due to timeout or invalid ID.");
      console.log("Error in callback_query:", e);
    } else {
      console.error(e);
    }
  }
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.log("GrammyError bot.catch((err)", e);
    console.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    console.log("HttpError bot.catch((err)", e);
    console.error("Could not contact Telegram:", e);
  } else {
    console.log("Unknown bot.catch((err)", e);
    console.error("Unknown error:", e);
  }
});

async function checkAccountType(ctx: any, address: any) {
  const connection = new Connection(
    `${ctx.session.tritonRPC}${ctx.session.tritonToken}`
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
process.on("uncaughtException", (err, origin) => {
  console.error(`Caught exception: ${err}\n` + `Exception origin: ${origin}`);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("SIGINT", async () => {
  if (backupSession) {
    await UserSession.findOneAndUpdate(
      { chatId: backupSession.chatId },
      backupSession,
      { upsert: true }
    )
      .then(() => {
        console.log(":: Stored user session to DB");
      })
      .catch((e: any) => {
        console.log("error", e);
      });
  }
  process.exit();
});
