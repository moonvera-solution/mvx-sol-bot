import { USERPOSITION_TYPE } from '@/service/util/types';
import { UserPositions, _initDbConnection } from '../db';
import { connection, wallet } from '../../config';
import { ISESSION_DATA } from '../service/util/types';
import { PublicKey } from '@metaplex-foundation/js';
import BigNumber from 'bignumber.js';
import { SPL_ACCOUNT_LAYOUT, TOKEN_PROGRAM_ID } from '@raydium-io/raydium-sdk';
import { getSolanaDetails } from "../api/priceFeeds/coinMarket";
import { getRayPoolKeys } from '../service/dex/raydium/market-data/1_Geyser';
import { quoteToken } from './util/dataCalculation';

export async function display_spl_positions(
    ctx: any,
) {
    const userWallet = ctx.session.portfolio.wallets[ctx.session.activeWalletIndex].publicKey;
    const userPosition: any = await UserPositions.find({ walletId: userWallet });
    console.log("userPosition:: ", userPosition[0].positions.length);

    let messageText = `Current positions.`;
    let buttons: any = [];
    let dynamicCallback;
    const solprice = await getSolanaDetails();


    if (userPosition && userPosition[0].positions) {
        for (let index in userPosition[0].positions) {

            let pos = userPosition[0].positions[index];
            const token = String(pos.baseMint);

            const tokenAccountInfo = await connection.getParsedTokenAccountsByOwner(new PublicKey(userWallet), { mint: new PublicKey(token), programId: TOKEN_PROGRAM_ID });
            let userBalance = new BigNumber(tokenAccountInfo.value[0] && tokenAccountInfo.value[0].account.data.parsed.info.tokenAmount.amount);

            if (!userBalance.gt(0)) continue;
            let poolKeys = await getRayPoolKeys(token);

            const tokenInfo = await quoteToken({
                baseVault: poolKeys.baseVault,
                quoteVault: poolKeys.quoteVault,
                baseDecimals: poolKeys.baseDecimals,
                quoteDecimals: poolKeys.quoteDecimals,
                baseSupply: poolKeys.baseMint
            });

            const tokenPriceSOL = tokenInfo.price;
            console.log("tokenPriceSOL:: ", tokenPriceSOL.toNumber());

            const tokenPriceUSD = tokenInfo.price.times(solprice);
            console.log("tokenPriceUSD:: ", tokenPriceUSD.toNumber());

            const displayUserBalance = userBalance.toFixed(poolKeys.baseDecimals);
            // console.log("displayUserBalance:: ", displayUserBalance);
            let subNumberformatted = formatSubscriptNumber(tokenPriceUSD)
            console.log("subNumberformatted:: ", tokenPriceSOL);
            dynamicCallback = `_p:${token}`;
            buttons.push(
                [
                    { text: `${pos.symbol}`, callback_data: '_' },
                    // { text: `${displayUserBalance} ${pos.symbol}`, callback_data: '_' },
                    // { text: `${tokenPriceSOL} SOL`, callback_data: '_' },
                    { text: `${subNumberformatted} SOL`, callback_data: '_' },
                    { text: `Sell 100%`, callback_data: dynamicCallback }
                ]
            )
        }
    };

    let options = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: buttons
        },
    };
    // console.log("buttons:: ",buttons);
    ctx.api.sendMessage(ctx.chat.id, messageText, options);
}

function formatSubscriptNumber(num:any) {
    console.log("num:: ",num);
    // Convert the number to a BigNumber and then to a fixed string
    const fixedString = new BigNumber(num).toFixed();
    console.log("fixedString:: ",fixedString);

    // Split the string into the integer and decimal parts
    const [integerPart, decimalPart] = fixedString.split('.');
    console.log("integerPart:: ",integerPart);
    console.log("decimalPart:: ",decimalPart);

    // Count the number of trailing zeros in the decimal part
    const trailingZeros = (decimalPart.match(/^0*/) || [''])[0].length;

    console.log("trailingZeros:: ",trailingZeros);
    // Remove the trailing zeros
    const trimmedDecimalPart = decimalPart.replace(/0+$/, '');
    console.log("trimmedDecimalPart:: ",trimmedDecimalPart);
    // Map the number of trailing zeros to a subscript character
    const subscriptNumbers = ['₀', '₁', '₂', '₃', '₄', '₅','₆', '₇', '₈', '₉'];
    const subscript = trailingZeros > 0 ? subscriptNumbers[trailingZeros] : '';
    console.log("subscript:: ",subscript);

    // Return the formatted string
    return `${integerPart}.${trimmedDecimalPart}${subscript}`;
}



// display_spl_positions('').then().catch(console.error);