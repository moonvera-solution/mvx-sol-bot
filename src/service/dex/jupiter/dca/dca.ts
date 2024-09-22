import { CloseDCAParams, DCA, Network, type CreateDCAParamsV2, type DepositParams, type WithdrawParams } from '@jup-ag/dca-sdk';
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import {CONNECTION} from "../../../../config";
import bs58 from 'bs58';

const connection = CONNECTION;
const dca = new DCA(connection, Network.MAINNET);
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const BONK = new PublicKey('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');

export async function create_dca (ctx: any){
    const chatId = ctx.chat.id;
    const walletIdx = ctx.session.portfolio.activeWalletIndex;
    const wallet = ctx.session.portfolio.wallets[walletIdx];
    const userWallet: Keypair = Keypair.fromSecretKey(bs58.decode(String(wallet.secretKey)));

    const params: CreateDCAParamsV2 = {
        payer: wallet.publickey, // could have a different account pay for the tx (make sure this account is also a signer when sending the tx)
        user: wallet.publicKey,
        inAmount: BigInt(5_000_000), // buy a total of 5 USDC over 5 days
        inAmountPerCycle: BigInt(1_000_000), // buy using 1 USDC each day
        cycleSecondsApart: BigInt(86400), // 1 day between each order -> 60 * 60 * 24
        inputMint: USDC, // sell
        outputMint: BONK, // buy
        minOutAmountPerCycle: null,  // effectively allows for a max price. refer to Integration doc
        maxOutAmountPerCycle: null, // effectively allows for a min price. refer to Integration doc
        startAt: null, // unix timestamp in seconds
        // optional: if the inputMint token is not in an Associated Token Account but some other token account, pass in the PublicKey of the token account, otherwise, leave it undefined
      };

}

