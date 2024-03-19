import { USERPOSITION_TYPE } from '@/service/util/types';
import { UserPositions, _initDbConnection } from '../db';
import { connection, wallet } from '../../config';
import { ISESSION_DATA } from '../service/util/types';
import { PublicKey } from '@metaplex-foundation/js';
import BigNumber from 'bignumber.js';
import { SPL_ACCOUNT_LAYOUT, TOKEN_PROGRAM_ID } from '@raydium-io/raydium-sdk';


export async function display_spl_positions(
    ctx: any,
) {
    const userWallet =  ctx.session.portfolio.wallets[ctx.session.activeWalletIndex].publicKey;
    console.log("userWallet:: ",userWallet);
    
    const userPosition: any = await UserPositions.find({ walletId: userWallet });
    console.log("userPosition:: ",userPosition);
    
    let messageText = `You might wanna sell all these shitcoins.`;
    let buttons: any = [];
    let dynamicCallback;

    if (userPosition && userPosition[0].positions) {
        for (let index in userPosition[0].positions) {
            let pos = userPosition[0].positions[index];
            const token = String(pos.baseMint);

            const tokenAccountInfo = await connection.getParsedTokenAccountsByOwner(
                new PublicKey(userWallet), {
                mint: new PublicKey(token),
                programId: TOKEN_PROGRAM_ID
            });
            let userBalance = new BigNumber(tokenAccountInfo.value[0] && tokenAccountInfo.value[0].account.data.parsed.info.tokenAmount.amount);
            dynamicCallback = `_p:${token}`;

            // TODO: add delete position from db if balance is 0
            
            if (userBalance.gt(0)) { // else none to sell
                buttons.push(
                    [
                        { text: `${pos.symbol}`, callback_data: '_' },
                        { text: `${userBalance}`, callback_data: '_' },
                        { text: `Sell 100%`, callback_data: dynamicCallback }
                    ]
                )
            }
        }
    };

    let options = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: buttons
        },
    };
    console.log("buttons:: ",buttons);
    ctx.api.sendMessage(ctx.chat.id, messageText, options);
}

// display_spl_positions('').then().catch(console.error);