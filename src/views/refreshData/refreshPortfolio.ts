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
    const userPosition: any = await UserPositions.find({ positionChatId: chatId, walletId: userWallet },  { positions: { $slice: -7} } )
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);

    const solprice = await getSolanaDetails();
    if (userPosition[0].positions.length == 0) {
        // await UserPositions.deleteOne({ positionChatId: chatId, walletId: userWallet });
        await ctx.api.sendMessage(ctx.chat.id, "No positions found.", { parse_mode: 'HTML' });
        return;
    }
    let currentIndex = ctx.session.positionIndex;
    if(userPosition[0].positions[currentIndex]){
        ctx.session.activeTradingPool = await getRayPoolKeys(ctx,userPosition[0].positions[currentIndex].baseMint);
    }
    // Function to create keyboard for a given position
    const createKeyboardForPosition = () => {
    

        return [
            [{ text: 'Manage Positions', callback_data: `display_single_spl_positions` }, 
            { text: 'Refresh Psitions', callback_data: `refresh_portfolio` }],
        ];
    };

    try {

        let fullMessage = '';
        if (userPosition && userPosition[0]?.positions) {
            for (let index in userPosition[0].positions) {

                let pos = userPosition[0].positions[index];
                const token = String(pos.baseMint);

                const tokenAccountInfo = await connection.getParsedTokenAccountsByOwner(new PublicKey(userWallet), { mint: new PublicKey(token), programId: TOKEN_PROGRAM_ID });
                let userBalance = new BigNumber(tokenAccountInfo.value[0] && tokenAccountInfo.value[0].account.data.parsed.info.tokenAmount.amount);
                    console.log('userBalance', userBalance);

                if (pos.amountIn == 0 || pos.amountOut == 0 || pos.amountOut < 0 || pos.amountIn < 0 || userBalance.toNumber() == 0) {
                    await UserPositions.updateOne(
                        { walletId: userWallet },
                        {
                            $pull: { positions: { baseMint: pos.baseMint } }
                        });
                    continue;
                }


                // console.log("userBalance:: ", userBalance.toNumber());
                if (!userBalance.gt(0)) {
                    await UserPositions.updateOne(
                        { walletId: userWallet },
                        { $pull: { positions: { baseMint: token } } }
                    );
                    continue;
                }
                function poolKeysExists(poolKeysArray: any, newPoolKeys: any) {
                    return poolKeysArray.some((existingKeys: any) =>
                        existingKeys.baseVault === newPoolKeys.baseVault &&
                        existingKeys.quoteVault === newPoolKeys.quoteVault &&
                        existingKeys.baseDecimals === newPoolKeys.baseDecimals &&
                        existingKeys.quoteDecimals === newPoolKeys.quoteDecimals &&
                        existingKeys.baseMint === newPoolKeys.baseMint);
                }

                let poolKeys = await getRayPoolKeys(ctx, token);
                if (!poolKeysExists(ctx.session.positionPool, poolKeys)) {
                    ctx.session.positionPool.push(poolKeys);
                }
                // console.log('poolKeys', ctx.session.positionPool.length);
                const tokenInfo = await quoteToken({
                    baseVault: poolKeys.baseVault,
                    quoteVault: poolKeys.quoteVault,
                    baseDecimals: poolKeys.baseDecimals,
                    quoteDecimals: poolKeys.quoteDecimals,
                    baseSupply: poolKeys.baseMint,
                    connection
                });
                const tokenPriceSOL = tokenInfo.price.toNumber();
                const tokenPriceUSD = Number(tokenInfo.price) * (solprice).toFixed(2);
                const displayUserBalance = userBalance.toFixed(poolKeys.baseDecimals);
                const userBalanceUSD = (userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals))).times(tokenPriceUSD).toFixed(2);
                const userBalanceSOL = (userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals))).times(tokenPriceSOL).toFixed(3);

                // console.log('valueInUSD', valueInUSD);
                const valueInSOL = (pos.amountOut - userBalance.toNumber()) < 5 ? (Number(pos.amountOut)) / Math.pow(10, poolKeys.baseDecimals) * Number(tokenPriceSOL) : 'N/A';
                const valueInUSD = (pos.amountOut - userBalance.toNumber()) < 5 ? (Number(pos.amountOut)) / Math.pow(10, poolKeys.baseDecimals) * Number(tokenPriceUSD) : 'N/A';
                // console.log('valueInUSD', valueInUSD);
                // console.log('valueInSOL', valueInSOL);
                // console.log('tokenPriceUSD', tokenPriceUSD);
                // console.log('tokenPriceSOL', tokenPriceSOL);
                // console.log('solprice', solprice);
                // console.log('userBalanceUSD', userBalanceUSD);
                // console.log('userBalanceSOL', userBalanceSOL);
                // console.log('userbalance', userBalance.toNumber());
                // console.log('initialInUSD', (pos.amountIn / 1e9) * Number(solprice));
                // console.log('initialInSOL', (pos.amountIn / 1e9));
                // console.log('valueInSOL', valueInSOL);
                const initialInUSD = (pos.amountIn / 1e9) * Number(solprice);
                // console.log('initialInUSD', initialInUSD);
                const initialInSOL = (pos.amountIn / 1e9);
                // console.log('initialInSOL', initialInSOL);
                const profitPercentage = valueInSOL != 'N/A' ? (valueInSOL - (pos.amountIn / 1e9 )) / (pos.amountIn / 1e9 ) * 100 : 'N/A';
                const profitInUSD = valueInUSD != 'N/A' ? valueInUSD - initialInUSD : 'N/A';
                const profitInSol = valueInSOL != 'N/A' ? valueInSOL - initialInSOL : 'N/A';
                const marketCap = tokenInfo.marketCap.toNumber() * (solprice).toFixed(2);
                const formattedmac = await formatNumberToKOrM(marketCap) ?? "NA";
         

                fullMessage += `<b>${pos.name} (${pos.symbol})</b> | <code>${poolKeys.baseMint}</code>\n` +
                    `Mcap: ${formattedmac} <b>USD</b>\n` +
                    `Capital: ${initialInSOL.toFixed(4)} <b>SOL</b> | ${initialInUSD.toFixed(4)} <b>USD </b>\n` +
                    `Current value: ${valueInSOL != 'N/A' ? valueInSOL.toFixed(4) : 'N/A'} <b>SOL</b> | ${valueInUSD != 'N/A' ? valueInUSD.toFixed(4) : 'N/A'} <b>USD </b>\n` +
                    `Profit: ${profitInSol != 'N/A' ? profitInSol.toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD != 'N/A' ? profitInUSD.toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage != 'N/A' ? profitPercentage.toFixed(2) : 'N/A'}%\n\n` +
                    `Token Balance in Wallet: ${Number(userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals))).toFixed(3)} <b>${pos.symbol}</b> | ${userBalanceSOL} <b>SOL</b> | ${userBalanceUSD} <b>USD</b>\n\n`;
            }
        };
        let keyboardButtons = createKeyboardForPosition();

        let options = {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: keyboardButtons },
        };
  
        await ctx.editMessageText(fullMessage, options);

      
} catch (err) {
    console.error(err);

}
}
