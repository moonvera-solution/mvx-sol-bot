import { USERPOSITION_TYPE } from '@/service/util/types';
import { UserPositions } from '../db';
import { connection, wallet } from '../../config';
import { ISESSION_DATA } from '../service/util/types';
import { PublicKey, sol } from '@metaplex-foundation/js';
import BigNumber from 'bignumber.js';
import { SPL_ACCOUNT_LAYOUT, TOKEN_PROGRAM_ID } from '@raydium-io/raydium-sdk';
import { getSolanaDetails } from "../api/priceFeeds/coinMarket";
import { getRayPoolKeys } from '../service/dex/raydium/market-data/1_Geyser';
import { quoteToken } from './util/dataCalculation';
import { formatNumberToKOrM } from '../service/util';

export async function display_spl_positions(
    ctx: any,
) {
    const chatId = ctx.chat.id;
    const userWallet = ctx.session.portfolio.wallets[ctx.session.activeWalletIndex].publicKey;
    const userPosition: any = await UserPositions.find({ positionChatId: chatId, walletId: userWallet });
    // console.log("userPosition:: ", userPosition[0]);
    
    let messageParts = [];
    
    const solprice = await getSolanaDetails();
    // console.log(userPosition[0]?.positions.length)
    if( userPosition[0].positions.length == 0) {
            await ctx.api.sendMessage(ctx.chat.id, "No positions found", { parse_mode: 'HTML' });
            return;
    }

    if (userPosition && userPosition[0]?.positions) {
        for (let index in userPosition[0].positions) {

            let pos = userPosition[0].positions[index];
            const token = String(pos.baseMint);
            
            const tokenAccountInfo = await connection.getParsedTokenAccountsByOwner(new PublicKey(userWallet), { mint: new PublicKey(token), programId: TOKEN_PROGRAM_ID });
            let userBalance = new BigNumber(tokenAccountInfo.value[0] && tokenAccountInfo.value[0].account.data.parsed.info.tokenAmount.amount);
            // console.log("userBalance:: ", userBalance.toNumber());
            if (!userBalance.gt(0)) {
                await UserPositions.updateOne(
                    { walletId: userWallet },
                    { $pull: { positions: { baseMint: token } } }
                );
                continue;
            }

            let poolKeys = await getRayPoolKeys(token);
             ctx.session.positionPool.push(poolKeys);
             const tokenInfo = await quoteToken({
                baseVault: poolKeys.baseVault,
                quoteVault: poolKeys.quoteVault,
                baseDecimals: poolKeys.baseDecimals,
                quoteDecimals: poolKeys.quoteDecimals,
                baseSupply: poolKeys.baseMint
            });
            const tokenPriceSOL = tokenInfo.price.toNumber();
            const tokenPriceUSD = tokenInfo.price.times(solprice).toFixed(2);
            const displayUserBalance = userBalance.toFixed(poolKeys.baseDecimals);
            const userBalanceUSD = (userBalance.dividedBy(1e9)).times(tokenPriceUSD).toFixed(2);
            const userBalanceSOL = (userBalance.dividedBy(1e9)).times(tokenPriceSOL).toFixed(3);
            const valueInUSD = (pos.amountOut) / Math.pow(10,poolKeys.baseDecimals) * Number(tokenPriceUSD);
            const valueInSOL = (pos.amountOut) / Math.pow(10,poolKeys.baseDecimals) * Number(tokenPriceSOL);
            const initialInUSD = (pos.amountIn / 1e9) * Number(solprice);
            const initialInSOL = (pos.amountIn / 1e9) ;
            const profitPercentage = (valueInUSD - (pos.amountIn / 1e9 * solprice)) / (pos.amountIn / 1e9 * solprice) * 100;
            const profitInUSD = valueInUSD - initialInUSD;
            const profitInSol = valueInSOL - initialInSOL;
            const marketCap = tokenInfo.marketCap.toNumber() * (solprice).toFixed(2);
            const formattedmac= await formatNumberToKOrM(marketCap) ?? "NA";
        
            
            let positionDetails = `<b>${pos.name} (${pos.symbol})</b> | <code>${poolKeys.baseMint}</code>\n\n` +
            `Mcap: ${formattedmac} <b>USD</b>\n\n` +
            `Capital: ${initialInSOL.toFixed(4)} <b>SOL</b> | ${initialInUSD.toFixed(4)} <b>USD </b>\n` +
            `Current value: ${valueInSOL.toFixed(4)} <b>SOL</b> | ${valueInUSD.toFixed(4)} <b>USD </b>\n` +
            `Profit: ${profitInSol.toFixed(4)} <b>SOL</b> | ${profitInUSD.toFixed(4)} <b>USD</b> | ${profitPercentage.toFixed(2)}%\n\n ` +
            `Token Balance in Wallet: ${Number(userBalance.dividedBy(1e9)).toFixed(2)} <b>${pos.symbol}</b> |${userBalanceSOL} <b>SOL</b> | ${userBalanceUSD} <b>USD</b>\n`+
            ``;
      
                    let dynamicCallback = `_p:${token}`;
                    let sellButton = [
                    [{text: `sell 25%`, callback_data: `sellpos_25_${index}`},
                    {text: `sell 50%`, callback_data: `sellpos_50_${index}`},
                    {text: `sell 75%`, callback_data: `sellpos_75_${index}`}, 
                    {text: `sell 100%`, callback_data: `sellpos_100_${index}`}],
                    [{text: `buy... ${pos.symbol}`,callback_data: `buypos_x_${index}` },{text: `refresh`, callback_data: dynamicCallback}]
                    ];
                    messageParts.push({ text: positionDetails, buttons: sellButton, parse_mode: 'HTML'});
        }
    };

    for (let part of messageParts) {
        let options = {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: part.buttons
            },
        };
        await ctx.api.sendMessage(ctx.chat.id, part.text, options);
    }
}



async function formatSubscriptNumber(num: any) {
    // console.log("num:: ", num);
    // Convert the number to a BigNumber and then to a fixed string
    const fixedString = new BigNumber(num).toFixed();
    // console.log("fixedString:: ", fixedString);

    // Split the string into the integer and decimal parts
    const [integerPart, decimalPart] = fixedString.split('.');
    // console.log("integerPart:: ", integerPart);
    // console.log("decimalPart:: ", decimalPart);

    // Count the number of trailing zeros in the decimal part
    if (decimalPart) {
        const trailingZeros = (decimalPart.match(/^0*/) || [''])[0].length;

        // console.log("trailingZeros:: ", trailingZeros);
        // Remove the trailing zeros
        const trimmedDecimalPart = decimalPart.replace(/0+/, '');
        // console.log("trimmedDecimalPart:: ", trimmedDecimalPart);
        // Map the number of trailing zeros to a subscript character
        const subscriptNumbers = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
        const subscript = trailingZeros > 1 ? subscriptNumbers[trailingZeros - 1] : '';
        // console.log("subscript:: ", subscript);
        const oneZeroFix = subscript != '' ? subscript == '₀' ? '0' : `0${subscript}` : ''

        // Return the formatted string
        return `${integerPart}.${oneZeroFix}${roundLargeNumber(trimmedDecimalPart)}`;
    }
}


/**
 * In this code, we first convert the number to a string and extract the first 5 digits. 
 * Then, we round the last digit of these 5 digits. If the last digit is 5 or more, 
 * it gets rounded up to 10, otherwise it gets rounded down to 0.
 * Finally, we concatenate the first 4 digits with the rounded last digit and convert the result back to a number.
 */
function roundLargeNumber(num: string) {
    let strNum = num.toString();
    let firstFiveDigits = strNum.substring(0, 5);
    let lastDigit = Number(firstFiveDigits[4]);
    let roundedLastDigit = Math.round(lastDigit / 5) * 5;
    let res = Number(firstFiveDigits.substring(0, 4) + roundedLastDigit);
    return String(res).length < 5 ? res : String(res).substring(0, 4)
}


// formatSubscriptNumber(new BigNumber('0.00000004566')).then((r) => (console.log("=>",r)));
// formatSubscriptNumber(new BigNumber('234540.0000000004566')).then((r) => (console.log("=>",r)));
// formatSubscriptNumber(new BigNumber('20.4566')).then((r) => (console.log("=>",r)));
// display_spl_positions('').then().catch(console.error);