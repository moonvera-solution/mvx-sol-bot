
import { USERPOSITION_TYPE } from '@/service/util/types';
import { UserPositions, _initDbConnection } from '../db';
import { connection } from '../../config';
import { ISESSION_DATA } from '../service/util/types';
import { PublicKey } from '@metaplex-foundation/js';
import BigNumber from 'bignumber.js';


export async function display_spl_positions(
    ctx: any,
) {
    _initDbConnection();
    // const session: ISESSION_DATA = ctx.session;
    const userWallet = 'cVsN11LTUjictK1sUMsxdT5J2PKxZcJ858RXKNVuuZ4'// session.portfolio.wallets[session.activeWalletIndex];
    const userPosition: any = await UserPositions.find({ walletId: userWallet });

    // console.log('userPosition: ', userPosition);
    // console.log('userPosition: userWallet', userPosition && userPosition[0].positions);


    let messageText = `You might wanna sell all these shitcoins.`;
    let buttons: any = [];
    let dynamicCallback;

    userPosition && userPosition[0].positions.forEach(async (pos: any) => {
        console.log('pos: ', pos);
        const token = String(pos.poolKeys.baseMint);
        console.log('token: ', token);
        const currentBalance = await connection.getTokenAccountBalance(new PublicKey(token), 'processed');
        
        dynamicCallback = `pos:${token}:${currentBalance}`;

        if (BigNumber(currentBalance.value.amount).toNumber() > 0) { // else none to sell
            buttons.push(
                [
                    { text: `${pos.positions.symbol}`, callback_data: '_' },
                    { text: `${currentBalance}`, callback_data: '_' },
                    { text: `Sell 100%`, callback_data: dynamicCallback }
                ]
            )
        }
    })

    let options = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: [buttons]
        },
    };
    console.log('button: ', buttons)
    ctx.api.sendMessage(ctx.chat.id, messageText, options);
}

// display_spl_positions('').then().catch(console.error);