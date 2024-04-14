
import { UserPositions } from '../db';
import { PublicKey } from '@metaplex-foundation/js';
import { TOKEN_PROGRAM_ID } from '@raydium-io/raydium-sdk';
import { getSolanaDetails } from "../api/priceFeeds/coinMarket";
import { getRayPoolKeys } from '../service/dex/raydium/raydium-utils/formatAmmKeysById'
import { quoteToken } from './util/dataCalculation';
import { formatNumberToKOrM } from '../service/util';
import { Connection } from '@solana/web3.js';
import BigNumber from 'bignumber.js';

export async function display_spl_positions(ctx: any) {
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

        await ctx.api.sendMessage(ctx.chat.id, fullMessage, options);
    } catch (err) {
        console.error(err);

    }
}
async function synchronizePools(userPositions: any, ctx: any) {
    let updatedPools = [];
    for (let pos of userPositions) {
        let poolKeys = await getRayPoolKeys(ctx, pos.baseMint);
        updatedPools.push(poolKeys);
    }
    return updatedPools;
}

export async function display_single_spl_positions(ctx: any) {
    const chatId = ctx.chat.id;
    const userWallet = ctx.session.portfolio.wallets[ctx.session.activeWalletIndex]?.publicKey;
    const userPosition: any = await UserPositions.find({ positionChatId: chatId, walletId: userWallet },  { positions: { $slice: -7} } );
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);

    const solprice = await getSolanaDetails();
    if (!userPosition[0] || userPosition[0].positions.length === 0) {
        await ctx.api.sendMessage(ctx.chat.id, "No positions found.", { parse_mode: 'HTML' });
        return;
    }
    ctx.session.positionPool = await synchronizePools(userPosition[0].positions, ctx);

    let currentIndex = ctx.session.positionIndex;
    if(userPosition[0].positions[currentIndex]){
        currentIndex = 0; 
        ctx.session.positionIndex = currentIndex;  // Update session index
        let pos = userPosition[0].positions[currentIndex];
        const token = String(pos.baseMint);
        console.log('tokenzzz', token);
        const tokenAccountInfo = await connection.getParsedTokenAccountsByOwner(new PublicKey(userWallet), { mint: new PublicKey(token), programId: TOKEN_PROGRAM_ID });
        let userBalance = new BigNumber(tokenAccountInfo.value[0] && tokenAccountInfo.value[0].account.data.parsed.info.tokenAmount.amount);
        if (pos.amountIn == 0 || pos.amountOut == 0 || pos.amountOut < 0 || pos.amountIn < 0 || userBalance.toNumber() == 0) {
            await UserPositions.updateOne({ walletId: userWallet },{$pull: { positions: { baseMint: pos.baseMint } }});
        }
      
        ctx.session.activeTradingPool = await getRayPoolKeys(ctx,userPosition[0].positions[currentIndex].baseMint);
      
    }

    const createKeyboardForPosition = (index: any) => {
        let prevIndex = index - 1 < 0 ? userPosition[0].positions.length - 1 : index - 1;
        let nextIndex = index + 1 >= userPosition[0].positions.length ? 0 : index + 1;
        const priority_Level = ctx.session.priorityFees;

        return [
            [{ text: 'Sell 25%', callback_data: `sellpos_25_${currentIndex}` }, { text: `Sell 50%`, callback_data: `sellpos_50_${currentIndex}` }],
            [{ text: 'Sell 75%', callback_data: `sellpos_75_${currentIndex}` }, { text: `Sell 100%`, callback_data: `sellpos_100_${currentIndex}` }],
            [{ text: 'Buy more', callback_data: `buypos_x_${currentIndex}` }],
            [{ text: '⏮️ Previous', callback_data: `prev_position_${prevIndex}` }, 
             { text: 'Next ⏭️', callback_data: `next_position_${nextIndex}` }],
             [{ text: '📈 Priority fees', callback_data: '_' }],
             [
                 { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Medium ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },
                 { text: `High ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_high' }, { text: `Max ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_max' }
             ],
            [{ text: 'Refresh Positions', callback_data: 'display_refresh_single_spl_positions' }]
        ];
    };
    
    try {
        let fullMessage = '';
        if (userPosition && userPosition[0].positions) {
 
                let pos = userPosition[0].positions[currentIndex];
                const token = String(pos.baseMint);
                const tokenAccountInfo = await connection.getParsedTokenAccountsByOwner(new PublicKey(userWallet), { mint: new PublicKey(token), programId: TOKEN_PROGRAM_ID });
                let userBalance = new BigNumber(tokenAccountInfo.value[0] && tokenAccountInfo.value[0].account.data.parsed.info.tokenAmount.amount);
                if (pos.amountIn == 0 || pos.amountOut == 0 || pos.amountOut < 0 || pos.amountIn < 0 || userBalance.toNumber() == 0) {
                    await UserPositions.updateOne({ walletId: userWallet },{$pull: { positions: { baseMint: pos.baseMint } }});
                    return;

                }

                if (!userBalance.gt(0)) {
                    await UserPositions.updateOne({ walletId: userWallet },{ $pull: { positions: { baseMint: token } } });
                    return;
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
                const tokenInfo = await quoteToken({
                    baseVault: poolKeys.baseVault,
                    quoteVault: poolKeys.quoteVault,
                    baseDecimals: poolKeys.baseDecimals,
                    quoteDecimals: poolKeys.quoteDecimals,
                    baseSupply: poolKeys.baseMint,
                    connection
                });
                const tokenPriceSOL = tokenInfo.price.toNumber();
                const tokenPriceUSD = (Number(tokenPriceSOL) * (solprice)).toFixed(poolKeys.quoteDecimals);
                const displayUserBalance = userBalance.toFixed(poolKeys.baseDecimals);
                const userBalanceUSD = (userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals))).times(tokenPriceUSD).toFixed(3);
                const userBalanceSOL = (userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals))).times(tokenPriceSOL).toFixed(3);

                const valueInUSD = (pos.amountOut - userBalance.toNumber()) < 5 ? (Number(pos.amountOut)) / Math.pow(10, poolKeys.baseDecimals) * Number(tokenPriceUSD) : 'N/A';
                const valueInSOL = (pos.amountOut - userBalance.toNumber()) < 5 ? (Number(pos.amountOut)) / Math.pow(10, poolKeys.baseDecimals) * Number(tokenPriceSOL) : 'N/A';
                const initialInUSD = (pos.amountIn / 1e9) * Number(solprice);
                const initialInSOL = (pos.amountIn / 1e9);
                const profitPercentage = valueInUSD != 'N/A' ? (valueInUSD - (pos.amountIn / 1e9 * solprice)) / (pos.amountIn / 1e9 * solprice) * 100 : 'N/A';
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
     
        };
        let keyboardButtons = createKeyboardForPosition(currentIndex);

        let options = {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: keyboardButtons },
        };

        await ctx.api.sendMessage(ctx.chat.id, fullMessage, options);
    } catch (err) {
        console.error(err);

    }
}

export async function display_refresh_single_spl_positions(ctx: any) {
    const chatId = ctx.chat.id;
    const userWallet = ctx.session.portfolio.wallets[ctx.session.activeWalletIndex]?.publicKey;
    const userPosition: any = await UserPositions.find({ positionChatId: chatId, walletId: userWallet },  { positions: { $slice: -7} } );
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);

    const solprice = await getSolanaDetails();
    try {
    if (!userPosition[0]) {
        await ctx.api.sendMessage(ctx.chat.id, "No positions found.", { parse_mode: 'HTML' });
        return;
    }
    ctx.session.positionPool = await synchronizePools(userPosition[0].positions, ctx);

    let currentIndex = ctx.session.positionIndex;
    if(userPosition[0].positions[currentIndex]){
        ctx.session.positionIndex = currentIndex;  // Update session index

        let pos = userPosition[0].positions[currentIndex];
        const token = String(pos.baseMint);
        // console.log('tokenzzz', token);
        const tokenAccountInfo = await connection.getParsedTokenAccountsByOwner(new PublicKey(userWallet), { mint: new PublicKey(token), programId: TOKEN_PROGRAM_ID });
        let userBalance = new BigNumber(tokenAccountInfo.value[0] && tokenAccountInfo.value[0].account.data.parsed.info.tokenAmount.amount);
        if (pos.amountIn == 0 || pos.amountOut == 0 || pos.amountOut < 0 || pos.amountIn < 0 || userBalance.toNumber() == 0) {
            await UserPositions.updateOne({ walletId: userWallet },{$pull: { positions: { baseMint: pos.baseMint } }});
            return;
        }
     
        ctx.session.activeTradingPool = await getRayPoolKeys(ctx,userPosition[0].positions[currentIndex].baseMint);
    } 

    const createKeyboardForPosition = (index: any) => {
        let prevIndex = index - 1 < 0 ? userPosition[0].positions.length - 1 : index - 1;
        let nextIndex = index + 1 >= userPosition[0].positions.length ? 0 : index + 1;
        const priority_Level = ctx.session.priorityFees;
        return [
            [{ text: 'Sell 25%', callback_data: `sellpos_25_${currentIndex}` }, { text: `Sell 50%`, callback_data: `sellpos_50_${currentIndex}` }],
            [{ text: 'Sell 75%', callback_data: `sellpos_75_${currentIndex}` }, { text: `Sell 100%`, callback_data: `sellpos_100_${currentIndex}` }],
            [{ text: 'Buy more', callback_data: `buypos_x_${currentIndex}` }],
            [{ text: '⏮️ Previous', callback_data: `prev_position_${prevIndex}` }, 
             { text: 'Next ⏭️', callback_data: `next_position_${nextIndex}` }],
             [{ text: '📈 Priority fees', callback_data: '_' }],
             [
                 { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Medium ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },
                 { text: `High ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_high' }, { text: `Max ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_max' }
             ],
            [{ text: 'Refresh Positions', callback_data: 'display_refresh_single_spl_positions' }]
        ];
    };
    
 

        let fullMessage = '';
        if (userPosition && userPosition[0].positions) {

                let pos = userPosition[0].positions[currentIndex];
                const token = String(pos.baseMint);
                console.log('tokenzzz', token);
                const tokenAccountInfo = await connection.getParsedTokenAccountsByOwner(new PublicKey(userWallet), { mint: new PublicKey(token), programId: TOKEN_PROGRAM_ID });
                let userBalance = new BigNumber(tokenAccountInfo.value[0] && tokenAccountInfo.value[0].account.data.parsed.info.tokenAmount.amount);
                if (pos.amountIn == 0 || pos.amountOut == 0 || pos.amountOut < 0 || pos.amountIn < 0 || userBalance.toNumber() == 0) {
                    await UserPositions.updateOne({ walletId: userWallet },{$pull: { positions: { baseMint: pos.baseMint } }});
                    return;
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
                const tokenInfo = await quoteToken({
                    baseVault: poolKeys.baseVault,
                    quoteVault: poolKeys.quoteVault,
                    baseDecimals: poolKeys.baseDecimals,
                    quoteDecimals: poolKeys.quoteDecimals,
                    baseSupply: poolKeys.baseMint,
                    connection
                });
                const tokenPriceSOL = tokenInfo.price.toNumber();
                const tokenPriceUSD = (Number(tokenPriceSOL) * (solprice)).toFixed(poolKeys.quoteDecimals);
           
                const displayUserBalance = userBalance.toFixed(poolKeys.baseDecimals);
                const userBalanceUSD = (userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals))).times(tokenPriceUSD).toFixed(2);
                const userBalanceSOL = (userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals))).times(tokenPriceSOL).toFixed(3);

                const valueInUSD = (pos.amountOut - userBalance.toNumber()) < 5 ? (Number(pos.amountOut)) / Math.pow(10, poolKeys.baseDecimals) * Number(tokenPriceUSD) : 'N/A';
                const valueInSOL = (pos.amountOut - userBalance.toNumber()) < 5 ? (Number(pos.amountOut)) / Math.pow(10, poolKeys.baseDecimals) * Number(tokenPriceSOL) : 'N/A';
                const initialInUSD = (pos.amountIn / 1e9) * Number(solprice);
                const initialInSOL = (pos.amountIn / 1e9);
                const profitPercentage = valueInUSD != 'N/A' ? (valueInUSD - (pos.amountIn / 1e9 * solprice)) / (pos.amountIn / 1e9 * solprice) * 100 : 'N/A';
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

        };
        let keyboardButtons = createKeyboardForPosition(currentIndex);

        let options = {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: keyboardButtons },
        };
        console.log('fullMessage', fullMessage);
        await ctx.editMessageText(fullMessage, options);
    } catch (err) {
        console.error(err);

    }
}