
import bs58 from "bs58";
import { Keypair } from '@solana/web3.js';
import { _savePortfolio } from '../../db/mongo/crud';
import { Portfolios,UserPositions } from '../../db/mongo/schema';
import { PORTFOLIO_TYPE, DefaultPortfolioData } from '../util/types';
import { generateSolanaWallet, getSolBalance } from "../util";

export async function getPortfolio(chatId: any): Promise<PORTFOLIO_TYPE> {
  const portfolio: PORTFOLIO_TYPE | null = await Portfolios.findOne({ chatId });
  if (portfolio) {
    return portfolio as PORTFOLIO_TYPE;
  }
  return DefaultPortfolioData as PORTFOLIO_TYPE;
}


export async function createUserPortfolio(ctx: any): Promise<any> {
  const chatId = ctx.chat.id;
  try {
    const { publicKey, secretKey } = generateSolanaWallet();
    await _savePortfolio(
      chatId,
      publicKey,
      secretKey
    );
    return Keypair.fromSecretKey(secretKey);
  } catch (error: any) {
    console.error('Error creating Solana wallet:', error.message);
    await ctx.api.sendMessage(chatId, 'Error creating wallet. Please try again.');
    return;
  }

}

export async function createNewWallet(ctx: any) {
  const chatId = ctx.chat.id;

  try {
    // Generate a new Solana wallet
    let { publicKey, secretKey } = generateSolanaWallet();

    // Note: Avoid logging the secret key for security reasons

    // Create a wallet object with the public key and encoded secret key
    const newWallet = {
      walletId: publicKey,
      publicKey: publicKey,
      secretKey: bs58.encode(secretKey) // Encode the Uint8Array secretKey with base58
    };

    // Save the new wallet in the database
    await Portfolios.updateOne(
      { chatId },
      { $push: { wallets: newWallet } },
      { upsert: true }
    );

  } catch (error: any) {
    console.error('Error creating Solana wallet:', error.message);
    await ctx.api.sendMessage(chatId, 'Error creating wallet. Please try again.');
    return;
  }

  return;
}


export async function importWallet(ctx: any, secretKey: string): Promise<any> {
  const chatId = ctx.chat.id;
  const wallet = await Portfolios.findOne({ chatId });

  try {
    if (wallet) {
      let newKeypair: Keypair = Keypair.fromSecretKey(bs58.decode(secretKey));
      let publicKeyBase58 = String(newKeypair.publicKey.toBase58());

      if (!wallet.wallets.some((w: any) => w.publicKey === publicKeyBase58)) {
        wallet.wallets.push({
          walletId: publicKeyBase58,
          publicKey: publicKeyBase58,
          secretKey: bs58.encode(newKeypair.secretKey)
        });
        await wallet.save();
        return { status: "success", wallet: wallet };
      } else {
        return { status: "wallet_exists" };
      }
    }
  } catch (err: any) {
    return { status: "error", message: err.message };
  }
}

export async function checkWalletsLength(ctx: any) {
  const chatId = ctx.chat.id;
  const wallet = await Portfolios.findOne({ chatId });
  if (wallet?.wallets.length == 2) {
    ctx.api.sendMessage(chatId, "You have reached the maximum number of wallets allowed per user.");
    return false;
  } else {
    return true;
  }
}

export async function handleGetPrivateKey(ctx: any) {
  const selectedWallet = ctx.session.portfolio.activeWalletIndex;
  const userWallet = ctx.session.portfolio.wallets[selectedWallet];
  const chatId = ctx.chat.id;

  const privatekeyString: any = userWallet.secretKey; // The user's public key
  try {
    console.log('userWallet', userWallet)
    // Fetch the user's wallet data 
    if (!userWallet || !userWallet.secretKey) {
      await ctx.api.sendMessage(chatId, "No wallet found. Please create a wallet first.");
      return;
    }
    // Create a message with the wallet information
    const walletInfoMessage = `Your private key:  ` +
      `<code><b>${privatekeyString}</b></code>\n`;
    const options: any = {
      reply_markup: JSON.stringify({
        inline_keyboard: [

          [{ text: 'Hide Private Key', callback_data: 'closing' }]
        ]
      }),
      parse_mode: 'HTML'
    };

    ctx.api.sendMessage(chatId, `${walletInfoMessage}`, options);
  } catch (err: any) {
    console.log("Something wrong when finding wallet data!", err.message);
    return err.message;
  }

}
// Not suporting resets yet 1eb2024
export async function confirmResetWalletAgain(ctx: any) {
  const chatId = ctx.chat.id;
  const options: any = {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: 'Yes, Reset Wallet', callback_data: 'delete_wallet' }],
        [{ text: 'No, Go Back', callback_data: 'cancel_reset_wallet' }]
      ]
    })
  };
  await ctx.api.sendMessage(chatId, 'This is your final warning. Are you absolutely sure you want to reset your wallet?', options);
}

export async function resetWallet(ctx: any) {
  const chatId = ctx.chat.id;
  const walletIndex = ctx.session.portfolio.activeWalletIndex;
  const userWallet = ctx.session.portfolio.wallets[walletIndex];

  const privatekeyString: any = userWallet.secretKey;
  console.log('walletPublicKey', walletIndex);
  console.log('privatekeyString', privatekeyString);

  try {
    await ctx.api.sendMessage(chatId, `⚠️ IMPORTANT: This is the private key of your wallet that is being deleted: <code><b>${privatekeyString}</b></code>\n\n` +
      " It is the only way to access the funds in the deleted wallet.", { parse_mode: 'HTML' });

    let updateQuery: any = {};
    updateQuery[`wallets.${walletIndex}`] = 1;
    console.log('updateQuery', updateQuery);
    await Portfolios.updateOne({ chatId }, { $unset: updateQuery }).catch((err: any) => {  console.log("Error deleting wlt position", err.message); });;
    await Portfolios.updateOne({ chatId }, { $pull: { wallets: null } }).catch((err: any) => {  console.log("Error deleting user position choice", err.message); });;

    await UserPositions.deleteOne({positionChatId: chatId, walletId: userWallet.publicKey }).catch((err: any) => {  console.log("Error deleting user position", err.message); });
    
    // Provide options for importing or creating a new wallet
    const options = {
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [{ text: 'Import Wallet', callback_data: 'import_wallet' }],
          [{ text: 'Create New Wallet', callback_data: 'create_new_wallet' }]
        ]
      })
    };
    await ctx.api.sendMessage(chatId, 'Would you like to import an existing wallet or create a new one?', options);

  } catch (err: any) {
    console.log("Something wrong when finding wallet data!", err.message);
    return err.message;
  }
}
// test
// console.log(importWallet(1, '2jaFhsbZMy8n7HzMAKrVYADqi5cYhKca7fWpet1gKGtb8X4EW7k1ZqpX7Qdr5NAaV4wTEK6L2mHvEFNaPg7sFR9L'));