
import { UserPositions } from '../db';
import { PublicKey } from '@metaplex-foundation/js';
import { TOKEN_PROGRAM_ID } from '@raydium-io/raydium-sdk';
import { getSolanaDetails, getTokenDataFromBirdEye } from "../api/priceFeeds/birdEye";
import { getRayPoolKeys } from '../service/dex/raydium/raydium-utils/formatAmmKeysById'
import { quoteToken } from './util/dataCalculation';
import { formatNumberToKOrM, getSolBalance } from '../service/util';
import { Connection } from '@solana/web3.js';
import BigNumber from 'bignumber.js';


interface Position {
    baseMint: string;
    name: string;
    symbol: string;
    tradeType: string;
    amountIn: number;
    amountOut: number | undefined;
}

interface UserPosition {
    pos: Position;
    userBalance: BigNumber;
}

export async function display_spl_positions(ctx: any, isRefresh: boolean) {
    const { publicKey: userWallet } = ctx.session.portfolio.wallets[ctx.session.activeWalletIndex] || {};
    if (!userWallet) return ctx.api.sendMessage(ctx.chat.id, "Wallet not found.", { parse_mode: 'HTML' });

    const userPosition = await UserPositions.find({ positionChatId: ctx.chat.id, walletId: userWallet }, { positions: { $slice: -7 } });
    
    if (!userPosition.length || !userPosition[0].positions.length) {
        return ctx.api.sendMessage(ctx.chat.id, "No positions found.", { parse_mode: 'HTML' });
    }

    const solprice = await getSolanaDetails();
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);

    let positionPoolKeys: any[] = []; 

    const tokenBalances = await Promise.all(userPosition[0].positions.map(pos =>
        connection.getParsedTokenAccountsByOwner(new PublicKey(userWallet), { mint: new PublicKey(pos.baseMint), programId: TOKEN_PROGRAM_ID })
    ));
    const messagePartsPromises = userPosition[0].positions.map(async (pos, i) => {
    const tokenAccountInfo = tokenBalances[i];
    const userBalance = new BigNumber(tokenAccountInfo.value[0]?.account.data.parsed.info.tokenAmount.amount || 0);
    if (pos.amountIn == 0 || pos.amountOut == 0 || pos.amountOut! < 0 || pos.amountIn < 0 || userBalance.toNumber() == 0) {
        await UserPositions.updateOne({ walletId: userWallet }, {$pull: { positions: { baseMint: pos.baseMint } }});
        return null;
    }

    if (userBalance.toNumber() <= 0) return null;

    return { pos, userBalance };
});

const messageParts: Promise<string>[] = (await Promise.all(messagePartsPromises))
    .filter((position): position is UserPosition => position !== null)  
    .map(async (position) => {
        const { pos, userBalance } = position; 

        let poolKeys = positionPoolKeys.find(pk => pk.baseMint === pos.baseMint) || await getRayPoolKeys(ctx, pos.baseMint);
        if (!positionPoolKeys.some(pk => pk.baseMint === pos.baseMint)) positionPoolKeys.push(poolKeys);

        const tokenInfo = await quoteToken({
            baseVault: poolKeys.baseVault,
            quoteVault: poolKeys.quoteVault,
            baseDecimals: poolKeys.baseDecimals,
            quoteDecimals: poolKeys.quoteDecimals,
            baseSupply: poolKeys.baseMint,
            connection
        });

        return formatPositionMessage(pos, poolKeys, userBalance, tokenInfo, solprice);
    });



    const fullMessage = (await Promise.all(messageParts)).join('');

    await sendMessage(ctx, fullMessage, isRefresh);
}

async function formatPositionMessage(pos: Position, poolKeys: any, userBalance: BigNumber, tokenInfo: any, solprice: number): Promise<string> {
    const amountOut = pos.amountOut ?? 0;  
    const tokenAddress = (pos.baseMint);
    const birdeyeData =  await  getTokenDataFromBirdEye(tokenAddress.toString());
    const tokenPriceUSD = birdeyeData 
  && birdeyeData.response 
  && birdeyeData.response.data 
  && birdeyeData.response.data.data 
  && birdeyeData.response.data.data.price != null  // This checks for both null and undefined
    ? birdeyeData.response.data.data.price 
    : tokenInfo.price.times(solprice).toNumber();
    const tokenPriceSOL = birdeyeData ? (tokenPriceUSD / solprice) : tokenInfo.price.toNumber();

    const displayUserBalance = userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals)).toFixed(3);
    const userBalanceUSD = userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals)).times(tokenPriceUSD).toFixed(4);
    const userBalanceSOL = userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals)).times(tokenPriceSOL).toFixed(4);
    const valueInSOL = pos.amountOut !== undefined && (pos.amountOut - userBalance.toNumber()) < 5
    ? (pos.amountOut / Math.pow(10, poolKeys.baseDecimals)) * tokenPriceSOL
    : 'N/A';

const valueInUSD = pos.amountOut !== undefined && (pos.amountOut - userBalance.toNumber()) < 5
    ? (pos.amountOut / Math.pow(10, poolKeys.baseDecimals)) * tokenPriceUSD
    : 'N/A';
  const initialInUSD = valueInUSD === 'N/A' ? 'N/A' : (pos.amountIn / 1e9) * solprice;
    const initialInSOL = valueInSOL === 'N/A' ? 'N/A' : (pos.amountIn / 1e9);
    const profitPercentage = valueInSOL !== 'N/A' ? ((valueInSOL - Number(initialInSOL)) / Number(initialInSOL)) * 100 : 'N/A';
    const profitInUSD = valueInUSD !== 'N/A' ? (valueInUSD - Number(initialInUSD)) : 'N/A';
    const profitInSol = valueInSOL !== 'N/A' ? (valueInSOL - Number(initialInSOL)) : 'N/A';
    const marketCap = tokenInfo.marketCap.toNumber() * solprice;
    const formattedMarketCap = new Intl.NumberFormat('en-US', { notation: "compact" }).format(marketCap);

    // Composing the message
    return `<b>${pos.name} (${pos.symbol})</b> | <code>${poolKeys.baseMint}</code>\n` +
        `Mcap: ${formattedMarketCap} <b>USD</b>\n` +
        `Initial: ${Number(initialInSOL).toFixed(4)} <b>SOL</b> | ${Number(initialInUSD).toFixed(4)} <b>USD</b>\n` +
        `Current value: ${valueInSOL !== 'N/A' ? Number(valueInSOL).toFixed(4) : 'N/A'} <b>SOL</b> | ${valueInUSD !== 'N/A' ? Number(valueInUSD).toFixed(4) : 'N/A'} <b>USD</b>\n` +
        `Profit: ${profitInSol !== 'N/A' ? Number(profitInSol).toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD !== 'N/A' ? Number(profitInUSD).toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage !== 'N/A' ? profitPercentage.toFixed(2) : 'N/A'}%\n\n` +
        `Token Balance: ${displayUserBalance} <b>${pos.symbol}</b> | ${userBalanceSOL} <b>SOL</b> | ${userBalanceUSD} <b>USD</b>\n\n`;
}


async function sendMessage(ctx: any, message: string, isRefresh: boolean) {
    const options = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: createKeyboardForPosition() },
    };
    if (isRefresh) {
        await ctx.editMessageText(message, options);
    } else {
        await ctx.api.sendMessage(ctx.chat.id, message, options);
    }
}

function createKeyboardForPosition() {
    return [
        [{ text: 'Manage Positions', callback_data: 'display_single_spl_positions' }, 
         { text: 'Refresh Positions', callback_data: 'refresh_portfolio' }],
    ];
}


async function synchronizePools(userPositions: any, ctx: any) {
    const promises = userPositions.map((pos: any) => getRayPoolKeys(ctx, pos.baseMint));
    const updatedPools = await Promise.all(promises);
    return updatedPools;
}

export async function display_single_spl_positions(ctx: any) {
    const chatId = ctx.chat.id;
    const userWallet = ctx.session.portfolio.wallets[ctx.session.activeWalletIndex]?.publicKey;
    const userPosition: any = await UserPositions.find({ positionChatId: chatId, walletId: userWallet },  { positions: { $slice: -7} } );
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);

        const [balanceInSOL, details] = await Promise.all([
        getSolBalance(userWallet, connection),
        getSolanaDetails()
    ]);
    if (!userPosition[0] || userPosition[0].positions.length === 0) {
        await ctx.api.sendMessage(ctx.chat.id, "No positions found.", { parse_mode: 'HTML' });
        return;
    }
    ctx.session.positionPool = await synchronizePools(userPosition[0].positions, ctx);
    // console.log('positionPool', ctx.session.positionPool);
    let currentIndex = ctx.session.positionIndex;
    if(userPosition[0].positions[currentIndex]){
        currentIndex = 0; 
        ctx.session.positionIndex = currentIndex;  // Update session index
        let pos = userPosition[0].positions[currentIndex];
        const token = String(pos.baseMint);
        // console.log('tokenzzz', token);`
        const tokenAccountInfo = await connection.getParsedTokenAccountsByOwner(new PublicKey(userWallet), { mint: new PublicKey(token), programId: TOKEN_PROGRAM_ID });
        let userBalance = new BigNumber(tokenAccountInfo.value[0] && tokenAccountInfo.value[0].account.data.parsed.info.tokenAmount.amount);
        if (pos.amountIn == 0 || pos.amountOut == 0 || pos.amountOut < 0 || pos.amountIn < 0 || userBalance.toNumber() == 0) {
            await UserPositions.updateOne({ walletId: userWallet },{$pull: { positions: { baseMint: pos.baseMint } }});
            return;
        }
        ctx.session.activeTradingPool =  ctx.session.positionPool.find((pool: any) => pool.baseMint === pos.baseMint) 
     
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
                 { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Med ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },
                 { text: `High ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_high' }, { text: `Max ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_max' }
             ],
            [{ text: 'Refresh', callback_data: 'display_refresh_single_spl_positions' }]
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
                const tokenPriceUSD = (Number(tokenPriceSOL) * (details)).toFixed(poolKeys.quoteDecimals);
                const displayUserBalance = userBalance.toFixed(poolKeys.baseDecimals);
                const userBalanceUSD = (userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals))).times(tokenPriceUSD).toFixed(3);
                const userBalanceSOL = (userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals))).times(tokenPriceSOL).toFixed(3);

                const valueInUSD = (pos.amountOut - userBalance.toNumber()) < 5 ? (Number(pos.amountOut)) / Math.pow(10, poolKeys.baseDecimals) * Number(tokenPriceUSD) : 'N/A';
                const valueInSOL = (pos.amountOut - userBalance.toNumber()) < 5 ? (Number(pos.amountOut)) / Math.pow(10, poolKeys.baseDecimals) * Number(tokenPriceSOL) : 'N/A';
                const initialInUSD = (pos.amountIn / 1e9) * Number(details);
                const initialInSOL = (pos.amountIn / 1e9);
                const profitPercentage = valueInUSD != 'N/A' ? (valueInUSD - (pos.amountIn / 1e9 * details)) / (pos.amountIn / 1e9 * details) * 100 : 'N/A';
                const profitInUSD = valueInUSD != 'N/A' ? valueInUSD - initialInUSD : 'N/A';
                const profitInSol = valueInSOL != 'N/A' ? valueInSOL - initialInSOL : 'N/A';
                const marketCap = tokenInfo.marketCap.toNumber() * (details).toFixed(2);
                const formattedmac = await formatNumberToKOrM(marketCap) ?? "NA";
             

                fullMessage += `<b>${pos.name} (${pos.symbol})</b> | <code>${poolKeys.baseMint}</code>\n` +
                    `Mcap: ${formattedmac} <b>USD</b>\n` +
                    `Initial: ${initialInSOL.toFixed(4)} <b>SOL</b> | ${initialInUSD.toFixed(4)} <b>USD </b>\n` +
                    `Current value: ${valueInSOL != 'N/A' ? valueInSOL.toFixed(4) : 'N/A'} <b>SOL</b> | ${valueInUSD != 'N/A' ? valueInUSD.toFixed(4) : 'N/A'} <b>USD </b>\n` +
                    `Profit: ${profitInSol != 'N/A' ? profitInSol.toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD != 'N/A' ? profitInUSD.toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage != 'N/A' ? profitPercentage.toFixed(2) : 'N/A'}%\n\n` +
                    `Token Balance: ${Number(userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals))).toFixed(3)} <b>${pos.symbol}</b> | ${userBalanceSOL} <b>SOL</b> | ${userBalanceUSD} <b>USD</b>\n\n` +
                    `Wallet Balance: <b>${balanceInSOL.toFixed(4)}</b> SOL | <b>${(
                        balanceInSOL * details
                      ).toFixed(2)}</b> USD\n\n` ;
     
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

    const [balanceInSOL, details] = await Promise.all([
        getSolBalance(userWallet, connection),
        getSolanaDetails()
    ]);
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
        ctx.session.activeTradingPool =  ctx.session.positionPool.find((pool: any) => pool.baseMint === pos.baseMint) 
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
                 { text: `Low ${priority_Level === 2500 ? '✅' : ''}`, callback_data: 'priority_low' }, { text: `Med ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_medium' },
                 { text: `High ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_high' }, { text: `Max ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_max' }
             ],
            [{ text: 'Refresh ', callback_data: 'display_refresh_single_spl_positions' }]
        ];
    };
    
 

        let fullMessage = '';
        if (userPosition && userPosition[0].positions) {

                let pos = userPosition[0].positions[currentIndex];
                const token = String(pos.baseMint);
                // console.log('tokenzzz', token);
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
                const tokenPriceUSD = (Number(tokenPriceSOL) * (details)).toFixed(poolKeys.quoteDecimals);
           
                const displayUserBalance = userBalance.toFixed(poolKeys.baseDecimals);
                const userBalanceUSD = (userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals))).times(tokenPriceUSD).toFixed(2);
                const userBalanceSOL = (userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals))).times(tokenPriceSOL).toFixed(3);

                const valueInUSD = (pos.amountOut - userBalance.toNumber()) < 5 ? (Number(pos.amountOut)) / Math.pow(10, poolKeys.baseDecimals) * Number(tokenPriceUSD) : 'N/A';
                const valueInSOL = (pos.amountOut - userBalance.toNumber()) < 5 ? (Number(pos.amountOut)) / Math.pow(10, poolKeys.baseDecimals) * Number(tokenPriceSOL) : 'N/A';
                const initialInUSD = (pos.amountIn / 1e9) * Number(details);
                const initialInSOL = (pos.amountIn / 1e9);
                const profitPercentage = valueInUSD != 'N/A' ? (valueInUSD - (pos.amountIn / 1e9 * details)) / (pos.amountIn / 1e9 * details) * 100 : 'N/A';
                const profitInUSD = valueInUSD != 'N/A' ? valueInUSD - initialInUSD : 'N/A';
                const profitInSol = valueInSOL != 'N/A' ? valueInSOL - initialInSOL : 'N/A';
                const marketCap = tokenInfo.marketCap.toNumber() * (details).toFixed(2);
                const formattedmac = await formatNumberToKOrM(marketCap) ?? "NA";
             

                fullMessage += `<b>${pos.name} (${pos.symbol})</b> | <code>${poolKeys.baseMint}</code>\n` +
                `Mcap: ${formattedmac} <b>USD</b>\n` +
                `Initial: ${initialInSOL.toFixed(4)} <b>SOL</b> | ${initialInUSD.toFixed(4)} <b>USD </b>\n` +
                `Current value: ${valueInSOL != 'N/A' ? valueInSOL.toFixed(4) : 'N/A'} <b>SOL</b> | ${valueInUSD != 'N/A' ? valueInUSD.toFixed(4) : 'N/A'} <b>USD </b>\n` +
                `Profit: ${profitInSol != 'N/A' ? profitInSol.toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD != 'N/A' ? profitInUSD.toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage != 'N/A' ? profitPercentage.toFixed(2) : 'N/A'}%\n\n` +
                `Token Balance: ${Number(userBalance.dividedBy(Math.pow(10, poolKeys.baseDecimals))).toFixed(3)} <b>${pos.symbol}</b> | ${userBalanceSOL} <b>SOL</b> | ${userBalanceUSD} <b>USD</b>\n\n` +
                `Wallet Balance: <b>${balanceInSOL.toFixed(4)}</b> SOL | <b>${(
                    balanceInSOL * details
                  ).toFixed(2)}</b> USD\n\n` ;

        };
        let keyboardButtons = createKeyboardForPosition(currentIndex);

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