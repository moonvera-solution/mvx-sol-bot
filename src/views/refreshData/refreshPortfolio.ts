import { UserPositions } from '../..//db';
import { PublicKey } from '@metaplex-foundation/js';
import { Connection } from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import {  TOKEN_PROGRAM_ID } from '@raydium-io/raydium-sdk';
import { getSolanaDetails } from "../../api/priceFeeds/coinMarket";
import { quoteToken } from "./../util/dataCalculation";
import { formatNumberToKOrM } from "../../service/util";
import { getRayPoolKeys } from '../../service/dex/raydium/raydium-utils/formatAmmKeysById'

export async function refresh_spl_positions(ctx: any) {
    const chatId = ctx.chat.id;
    const userWallet = ctx.session.portfolio.wallets[ctx.session.activeWalletIndex]?.publicKey;
    const userPosition: any = await UserPositions.find({ positionChatId: chatId, walletId: userWallet });
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);
    
    
    const solprice = await getSolanaDetails();
    // console.log(userPosition[0]?.positions.length)
    if( userPosition[0]?.positions.length == 0) {
            // await UserPositions.deleteOne({ positionChatId: chatId, walletId: userWallet });
            await ctx.api.sendMessage(ctx.chat.id, "No positions found", { parse_mode: 'HTML' });
            return;
    }
    let currentIndex = ctx.session.positionIndex;

    // Function to create keyboard for a given position
    const createKeyboardForPosition = (index: any) => {
        let prevIndex = index - 1 < 0 ? userPosition[0].positions.length - 1 : index - 1;
        let nextIndex = index + 1 >= userPosition[0].positions.length ? 0 : index + 1;

        let posSymbol = userPosition[0].positions[index].symbol; // Get the symbol for the current position

        return [
            [ { text: `${posSymbol}`, callback_data: `current_position` }],
            [{ text: `Sell 25%`, callback_data: `sellpos_25_${index}` },{ text: `Sell 50%`, callback_data: `sellpos_50_${index}` }],
            [{ text: `Sell 75%`, callback_data: `sellpos_75_${index}` },{ text: `Sell 100%`, callback_data: `sellpos_100_${index}` }],
            [{ text: `Buy more`, callback_data: `buypos_x_${index}` }],
            [{ text: 'Previous', callback_data: `prev_position_${prevIndex}` }, 
             { text: 'Next', callback_data: `next_position_${nextIndex}` }],
            [{ text: `Refresh Positions`, callback_data: 'refresh_portfolio' }]
        ];
    };
    let fullMessage = '';
    if (userPosition && userPosition[0]?.positions) {
        for (let index in userPosition[0].positions) {

            let pos = userPosition[0].positions[index];
            if(pos.amountIn == 0) {
                await UserPositions.updateOne(
                    { walletId: userWallet },
                    { $pull: { positions: { baseMint: pos.baseMint } }
                });
                continue;
            }
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

            let poolKeys = await getRayPoolKeys(ctx,token);
             ctx.session.positionPool.push(poolKeys);
             const tokenInfo = await quoteToken({
                baseVault: poolKeys.baseVault,
                quoteVault: poolKeys.quoteVault,
                baseDecimals: poolKeys.baseDecimals,
                quoteDecimals: poolKeys.quoteDecimals,
                baseSupply: poolKeys.baseMint,
                connection
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
            
            fullMessage += `<b>${pos.name} (${pos.symbol})</b> | <code>${poolKeys.baseMint}</code>\n` +
            `Mcap: ${formattedmac} <b>USD</b>\n` +
            `Capital: ${initialInSOL.toFixed(4)} <b>SOL</b> | ${initialInUSD.toFixed(4)} <b>USD </b>\n` +
            `Current value: ${valueInSOL.toFixed(4)} <b>SOL</b> | ${valueInUSD.toFixed(4)} <b>USD </b>\n` +
            `Profit: ${profitInSol.toFixed(4)} <b>SOL</b> | ${profitInUSD.toFixed(4)} <b>USD</b> | ${profitPercentage.toFixed(2)}%\n\n` +
            `Token Balance in Wallet: ${Number(userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals))).toFixed(3)} <b>${pos.symbol}</b> | ${userBalanceSOL} <b>SOL</b> | ${userBalanceUSD} <b>USD</b>\n\n`;
        }
    };
    let keyboardButtons = createKeyboardForPosition(currentIndex);

    let options = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: keyboardButtons },
    };

    await ctx.editMessageText(fullMessage, options);
}
