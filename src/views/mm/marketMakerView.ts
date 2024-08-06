import { PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getuserShitBalance, getUserTokenBalanceAndDetails } from '../../service/feeds';
import { formatNumberToKOrM, getSolBalance, generateSolanaWallet,getSwapAmountOutPump } from '../../service/util';
import { Keypair, Connection } from '@solana/web3.js';
import { runAllFees } from '../util/getPriority';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { UserPositions } from '../../db';
import { getTokenDataFromBirdEyePositions } from '../../api/priceFeeds/birdEye';
import { MVXBOT_FEES, SOL_ADDRESS } from "../../config";
import { jupiter_inx_swap } from '../../service/dex/jupiter/trade/swaps';
import bs58 from 'bs58';
import BigNumber from 'bignumber.js';
import { saveUserPosition } from "../../service/portfolio/positions";
import { display_pumpFun } from '../pumpfun/swapView';
import { getRayPoolKeys } from '../../service/dex/raydium/utils/formatAmmKeysById';
import { display_raydium_details } from '../raydium/swapAmmView';
import { getRayCpmmPoolKeys } from '../../service/dex/raydium/cpmm';
import { display_cpmm_raydium_details } from '../raydium/swapCpmmView';
import { _getRayPoolKeysForMM } from '../../service/dex/raydium/utils/formatAmmKeysById';
import { isSymbolObject } from "util/types";
import { display_cpmm_stats } from "./stats";


async function defineMarket(token: string, userWallet: Keypair): Promise<{ dex: string, keys: any }> {
    const { isCpmmPool, keys } = await _getRayPoolKeysForMM({ t1: token, t2: SOL_ADDRESS, userWallet });
    let dex = keys ? (isCpmmPool ? 'cpmm' : 'amm') : 'pumpfun';
    return { dex, keys };
}

export async function display_market_maker(ctx: any, isRefresh: boolean) {
    const mmToken = ctx.session.mmToken;
    const chatId = ctx.update.message.chat.id;
    const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
    const { dex, keys } = await defineMarket(mmToken, userWallet);
    ctx.session.mmDex = dex;
    let messageText = '';
    switch (dex) {
        case 'amm':
            // {messageText,options} = await display_raydium_details(ctx, false);
            break;
        case 'cpmm': {
            messageText = await display_cpmm_stats(ctx, keys);
            break;
        }
        case 'pumpfun':
            // await display_pumpFun_stats(ctx, false);
            break;
    }

    const options = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: [
                [{ text: ' 1M 9 SOL  4hrs', callback_data: 'run_1M_MM' }],
                [{ text: ' 5M 18 SOL 8hrs', callback_data: 'refresh_cpmm_trade' }],
                [{ text: ' 10M 27 SOL 16hrs', callback_data: 'refresh_cpmm_trade' }],
                [{ text: ' 25M 36 SOL 24hrs', callback_data: 'refresh_cpmm_trade' }],
            ]
        },
    };

    if (isRefresh) {
        await ctx.editMessageText(messageText, options);
    } else {
        await ctx.api.sendMessage(chatId, messageText, options);
    }
}
