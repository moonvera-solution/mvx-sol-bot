import { PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getUserTokenBalanceAndDetails } from '../../service/feeds';
import { quoteToken } from '../util/dataCalculation';
import { getSolanaDetails } from '../../api';
import { formatNumberToKOrM, getSolBalance } from '../../service/util';
import { Keypair, Connection } from '@solana/web3.js';
import { runAllFees } from '../util/getPriority';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { logErrorToFile } from "../../../error/logger";
import { getTokenDataFromBirdEye } from '../../api/priceFeeds/birdEye';
import {swap_solTracker} from '../../service/dex/solTracker';
import { Referrals } from '../../db/mongo/schema';
import {SOL_ADDR} from '../../../config';

import bs58 from "bs58";

export async function swap_pump_fun(ctx:any){
    const chatId = ctx.chat.id;
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
    const payerKeypair = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[activeWalletIndexIdx].secretKey));
    const referralCommision = ctx.session.referralCommision / 100;
    const referralRecord = await Referrals.findOne({ referredUsers: chatId });
    const tradeSide = ctx.session.pump.side;
    const tokenIn = tradeSide == 'buy' ? SOL_ADDR : ctx.session.pump.token;
    const tokenOut = tradeSide == 'buy' ? ctx.session.pump.token : SOL_ADDR;

    swap_solTracker({
        side: tradeSide,
        from: tokenIn,
        to :  tokenOut,
        amount :ctx.session.pump.amountIn,
        slippage: ctx.session.latestSlippage,
        payerKeypair: payerKeypair,
        referralWallet: null,//ctx.session.generatorWallet,
        referralCommision: null,//referralCommision,
        priorityFee: null,//ctx.session.priorityFees.HIGH,
        forceLegacy: true
    }).then(txSigs => {  
        txSigs && ctx.api.sendMessage(chatId, txSigs);
     }).catch(error => { throw new Error(error) });

}

export async function display_pump_fun_token_details(ctx: any, isRefresh: boolean) {
    const priority_Level = ctx.session.priorityFees;
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);

    const chatId = ctx.chat.id;
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
    try {

        let messageText = `<b>${ctx.session.pump.token}</b>`;

        // Define buy mode inline keyboard
        let options = {
            
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Buy (X SOL)', callback_data: 'buy_pump_X_SOL' }, 
                     { text: 'Sell (X SOL)', callback_data: 'sell_pump_X_SOL' }]
                ]}
        }

        if (isRefresh) {
            await ctx.api.editMessageText(messageText, options);
        } else {
            await ctx.api.sendMessage(chatId, messageText, options);
        }
    } catch (error: any) {
        console.error('Error in display_token_details:', error);
        console.error('Error in getTokenMetadata:', error.message);
        // ctx.api.sendMessage(chatId, "Error getting token data, verify the address..", { parse_mode: 'HTML' });
    }
}
