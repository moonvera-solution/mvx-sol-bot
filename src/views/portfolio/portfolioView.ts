
import { UserPositions } from '../../db';
import { PublicKey } from '@solana/web3.js';
import {  memeTokenPrice } from "../../api/priceFeeds/birdEye";
import { Portfolios } from '../../db';
import { formatNumberToKOrM, getSolBalance } from '../../service/util';
import BigNumber from 'bignumber.js';
import { Position, UserPosition } from '../../service/portfolio/positions';
import { getTokenMetadata, getuserShitBalance, getUserTokenBalanceAndDetails } from '../../service/feeds';
import { CONNECTION} from '../../config';
import { getSolanaDetails } from '../../api';

export async function display_all_positions(ctx: any, isRefresh: boolean) {
  const { publicKey: userWallet } = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex] || {};
  if (!userWallet) return ctx.api.sendMessage(ctx.chat.id, "Positions error", { parse_mode: 'HTML' });
  const userPosition = await UserPositions.find(
    {

      walletId: userWallet
    },
    {
      positions: { $slice: -15 }
    }
  );

  if (!userPosition.length || !userPosition[0].positions.length) {
    if(!ctx.session.autoBuy){
    ctx.session.latestCommand = 'jupiter_swap';
    }

    return ctx.api.sendMessage(ctx.chat.id, "No active positions.", { parse_mode: 'HTML' });
  }
  const connection = CONNECTION;
  let positionlKeys: any[] = [];

  const tokenBalances = await Promise.all(userPosition[0].positions.map(pos =>
    getuserShitBalance(userWallet, new PublicKey(pos.baseMint), connection),
  ));

    const messagePartsPromises = userPosition[0].positions.map(async (pos, i) => {
    const userBalance = new BigNumber(tokenBalances[i].userTokenBalance|| 0);
    if (pos.amountIn == 0 || pos.amountOut == 0  || pos.amountIn < 0 || userBalance.toNumber() == 0) {
      await UserPositions.updateOne({ walletId: userWallet }, { $pull: { positions: { baseMint: pos.baseMint } } })
        .then(() => { ctx.session.positionIndex = 0; });
      return null;
    }

    if (userBalance.toNumber() <= 0) return null;

    return { pos, userBalance };
  });

  const messageParts: Promise<string>[] = (await Promise.all(messagePartsPromises))
    .filter((position): position is UserPosition => position !== null)
    .map(async (position) => {
      const { pos, userBalance } = position;

      if (!positionlKeys.some(pk => pk.baseMint === pos.baseMint)) positionlKeys.push(pos.baseMint);
      const mint = pos.baseMint.toString();
      const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
      let swapUrlSol = `${rpcUrl}/jupiter/quote?inputMint=${'So11111111111111111111111111111111111111112'}&outputMint=${'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'}&amount=${1000000000}&slippageBps=${0}`.trim();
      const headers = { 'x-api-key': process.env.SOL_TRACKER_API_KEY! };

      const [ jupRate,tokenMetadataResult,jupSolPrice, shitBalance,solTrackerData] = await Promise.all([
        fetch( `https://api.jup.ag/price/v2?ids=${mint}&showExtraInfo=true`).then((response) => response.json()),
        getTokenMetadata(ctx, mint),
        fetch(swapUrlSol).then(res => res.json()),
        getuserShitBalance(userWallet,new PublicKey(mint), connection),
        fetch(`${process.env.SOL_TRACKER_API_URL}/rate?from=${mint}&to=So11111111111111111111111111111111111111112&amount=1`, { headers }).then((response) => response.json())

      ]);
      return formatPositionMessage(ctx,userWallet,pos, jupRate,tokenMetadataResult,jupSolPrice,shitBalance, solTrackerData);
    });



  const fullMessage = (await Promise.all(messageParts)).join('');

  await sendMessage(ctx, fullMessage, isRefresh);
}

async function formatPositionMessage(
  ctx: any,
  userWallet: string,
  pos: Position,
  jupRate: any,
  tokenMetadataResult: any,
  jupSolPrice: any,
  shitBalance:any,
  solTrackerData: any
): Promise<string> {
  let solPrice = 0; ;

  if(jupSolPrice && jupSolPrice.outAmount){
    solPrice = Number(jupSolPrice.outAmount / 1e6);
  } else {
    await getSolanaDetails().then((data) => {
      solPrice = data;
    });
  }

const jupTokenValue: any =  Object.values(jupRate.data);
let tokenPrice = 0;
 if (solTrackerData && solTrackerData.currentPrice) {
        tokenPrice = solTrackerData.currentPrice * solPrice; ;
      } else {
        await memeTokenPrice(pos.baseMint).then((data) => {
          tokenPrice = data;
        })
      }
  const tokenPriceSOL = tokenPrice / solPrice;
  const {
    tokenData,
  } = tokenMetadataResult;
  const baseDecimals = tokenData.mint.decimals;
  const totalSupply = new BigNumber(tokenData.mint.supply.basisPoints);
  const Mcap = await formatNumberToKOrM(Number(totalSupply.dividedBy(Math.pow(10, baseDecimals)).times(tokenPrice)));
  let initialInUSD = 0;
      let initialInSOL = 0;
      let valueInUSD: any;
      let valueInSOL: any;
      let profitPercentage;
      let profitInUSD;
      let profitInSol;
  if(pos && pos.amountOut ){
    initialInSOL = Number(pos.amountIn) / 1e9;
    initialInUSD = initialInSOL * Number(solPrice);

    valueInUSD = pos.amountOut  ? (pos.amountOut / Math.pow(10,baseDecimals)) * (tokenPrice) : NaN;
    valueInSOL = pos.amountOut  ? (pos.amountOut / Math.pow(10,baseDecimals)) * (tokenPriceSOL) : NaN;
    profitPercentage = valueInSOL  ? (Number(valueInSOL) - (Number(pos.amountIn) / 1e9)) / (Number(pos.amountIn) / 1e9) * 100 : NaN;
    profitInUSD = valueInUSD  ? Number(valueInUSD)  - initialInUSD : NaN;
    profitInSol = valueInSOL  ? valueInSOL - initialInSOL : NaN;
  }
  

  
  // Composing the message
  return `<b>${pos.name} (${pos.symbol})</b> | <code>${pos.baseMint}</code>\n` +
    `Mcap: ${Mcap} <b>USD</b>\n` +
    `Initial: ${Number(initialInSOL).toFixed(4)} <b>SOL</b> | ${Number(initialInUSD).toFixed(4)} <b>USD</b>\n` +
    `Current value: ${valueInSOL  ? Number(valueInSOL).toFixed(4) : NaN} <b>SOL</b> | ${valueInUSD ? Number(valueInUSD).toFixed(4) : NaN} <b>USD</b>\n` +
    `Profit: ${profitInSol  ? Number(profitInSol).toFixed(4) : NaN} <b>SOL</b> | ${profitInUSD  ? Number(profitInUSD).toFixed(4) : NaN} <b>USD</b> | ${profitPercentage ? Number(profitPercentage).toFixed(2) : 'N/A'}%\n\n` +
    `Token Balance: ${shitBalance.userTokenBalance.toFixed(4)} <b>${pos.symbol}</b> | ${((shitBalance.userTokenBalance) * Number(tokenPrice)).toFixed(4)}<b>USD</b> |${((shitBalance.userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} <b>SOL</b>\n\n`;
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
    [{ text: 'Manage Positions', callback_data: 'display_single_position' },
    { text: 'Refresh Positions', callback_data: 'refresh_portfolio' }],
  ];
}


async function synchronizePools(userPositions: any) {
  const promises = userPositions.map((pos: any) => (pos.baseMint));
  const updatedPools = await Promise.all(promises);
  return updatedPools;
}

export async function display_single_position(ctx: any, isRefresh: boolean) {
  const chatId = ctx.chat.id;
  const walletIndex = ctx.session.portfolio.activeWalletIndex;
  const userWallet = ctx.session.portfolio.wallets[walletIndex]?.publicKey;
  const userPosition: any = await UserPositions.find(
    {

      walletId: userWallet
    },
    {
      positions: { $slice: -15 }
    }
  );
  const connection = CONNECTION;
  if (!userPosition[0] || userPosition[0].positions.length === 0) {
    if(!ctx.session.autoBuy){
    ctx.session.latestCommand = 'jupiter_swap';
    }
    await ctx.api.sendMessage(ctx.chat.id, "No active positions.", { parse_mode: 'HTML' });
    return;
  }

  ctx.session.positionPool = await synchronizePools(userPosition[0].positions);

  let currentIndex = 0;
  if (
    ctx.session.positionIndex
    && userPosition[0].positions.length > ctx.session.positionIndex
    && ctx.session.positionIndex >= 0
  ) {
    currentIndex = ctx.session.positionIndex;
  }
 let token = ''
 
  if (userPosition[0].positions[currentIndex]) {
    // currentIndex = 0;
    ctx.session.positionIndex = currentIndex;  // Update session index -> 0
    let pos = userPosition[0].positions[currentIndex];
    token = String(pos.baseMint);

    let userBalance = await getuserShitBalance(userWallet, new PublicKey(token), connection);
    if (
      pos.amountIn == 0
      || pos.amountOut == 0
      || pos.amountOut < 0
      || pos.amountIn < 0
      || userBalance.userTokenBalance == 0
    ) {
      await UserPositions.updateOne(
        { walletId: userWallet },
        { $pull: { positions: { baseMint: pos.baseMint } } }
      )
        .then(() => { ctx.session.positionIndex = 0; currentIndex = 0; });
      return;
    }

  }

  const createKeyboardForPosition = (index: any) => {
    let prevIndex = index - 1 < 0 ? userPosition[0].positions.length - 1 : index - 1;
    let nextIndex = index + 1 >= userPosition[0].positions.length ? 0 : index + 1;
    let priority_Level = ctx.session.priorityFees;
    const priority_custom = ctx.session.ispriorityCustomFee;
    if(priority_custom === true){
      priority_Level = 0;
    }

    return [
      [{ text: `Sell 25%`, callback_data: `sellpos_25_${currentIndex}`}, { text: `Sell 50%`, callback_data: `sellpos_50_${currentIndex}`},{ text: `Sell 75%`, callback_data: `sellpos_75_${currentIndex}`}],
      [{ text: `Sell 100%`, callback_data: `sellpos_100_${currentIndex}` }],
      [{ text: '⏮️ Previous', callback_data: `prev_position_${prevIndex}` },
      { text: 'Next ⏭️', callback_data: `next_position_${nextIndex}` }],
      [{ text: 'Buy more', callback_data: `buypos_x_${currentIndex}` }],
      [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: `Set priority ${ctx.session.customPriorityFee}`, callback_data: 'set_customPriority' }],
      [{ text: 'Refresh', callback_data: 'display_refresh_single_spl_positions' }]
    ];
  };

  try {
    let fullMessage = '';
    if (userPosition && userPosition[0].positions) {

      let pos = userPosition[0].positions[currentIndex];

      const token = String(pos.baseMint);
      const tradeDex = String(pos.tradeType);
      ctx.session.swaptypeDex = pos.tradeType;

      let shitBalance = await getuserShitBalance(userWallet, new PublicKey(token), connection);
      console.log('shitBalance', shitBalance);
      if (
        pos.amountIn == 0
        || pos.amountOut == 0
        || pos.amountOut < 0
        || pos.amountIn < 0
        || shitBalance.userTokenBalance == 0
      ) {
        await UserPositions.updateOne({ walletId: userWallet }, { $pull: { positions: { baseMint: pos.baseMint } } })
          .then(() => { ctx.session.positionIndex = 0; currentIndex = 0; });
        return;
      }
      
      if (shitBalance.userTokenBalance <= 0) {
        await UserPositions.updateOne({ walletId: userWallet }, { $pull: { positions: { baseMint: token } } })
          .then(() => { ctx.session.positionIndex = 0; currentIndex = 0; });
        return;
      }
      const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
      let swapUrlSol = `${rpcUrl}/jupiter/quote?inputMint=${'So11111111111111111111111111111111111111112'}&outputMint=${'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'}&amount=${1000000000}&slippageBps=${0}`.trim();
      const headers = { 'x-api-key': process.env.SOL_TRACKER_API_KEY! };

      const [balanceInSOL, userShitbalance,tokenMetadataResult, jupSolPrice,solTrackerData] = await Promise.all([
        getSolBalance(userWallet, connection),
        getuserShitBalance(new PublicKey(userWallet), new PublicKey(token), connection),
        getTokenMetadata(ctx, token),
        fetch(swapUrlSol).then(res => res.json()),
        fetch(`${process.env.SOL_TRACKER_API_URL}/rate?from=${token}&to=So11111111111111111111111111111111111111112&amount=1`, { headers }).then((response) => response.json())



      ]);
      let solPrice = 0 ;
      
      if(jupSolPrice && jupSolPrice.outAmount){
        solPrice = Number(jupSolPrice.outAmount / 1e6);
        console.log('solPrice from jup:')
      } else {
        await getSolanaDetails().then((data) => {
          solPrice = data;
        });
        console.log('solPrice from birdeye:')
      }      
      let tokenPrice = 0;
      if (solTrackerData && solTrackerData.currentPrice) {
        tokenPrice = solTrackerData.currentPrice * solPrice; ;
      } else {
        await memeTokenPrice(token).then((data) => {
          tokenPrice = data;
        })
      }
      
    
     
     
      const {
        tokenData,
      } = tokenMetadataResult;
      const baseDecimals = tokenData.mint.decimals;
      const totalSupply = new BigNumber(tokenData.mint.supply.basisPoints);

      const Mcap = await formatNumberToKOrM(Number(totalSupply.dividedBy(Math.pow(10, baseDecimals)).times(tokenPrice)));
      const tokenPriceSOL = Number(tokenPrice) / Number(solPrice);
  
      let initialInUSD = 0;
      let initialInSOL = 0;
      let valueInUSD: any;
      let valueInSOL: any;
      let profitPercentage;
      let profitInUSD;
      let profitInSol;
  if(pos && pos.amountOut ){
    initialInSOL = Number(pos.amountIn) / 1e9;
    initialInUSD = initialInSOL * Number(solPrice);
    valueInUSD = pos.amountOut   ? (pos.amountOut / Math.pow(10,baseDecimals)) * Number(tokenPrice) : NaN;
    valueInSOL = pos.amountOut   ? (pos.amountOut / Math.pow(10,baseDecimals)) * tokenPriceSOL : NaN;
    console.log('valueInSOL:', valueInSOL);
    console.log('valueInUSD:', valueInUSD);
    console.log('pos.amountOut:', (pos.amountOut / Math.pow(10,baseDecimals)));
    profitPercentage = valueInSOL  ? (Number(valueInSOL) - (Number(pos.amountIn) / 1e9)) / (Number(pos.amountIn) / 1e9) * 100 : NaN;
    profitInUSD = valueInUSD  ? Number(valueInUSD)  - initialInUSD : NaN;
    profitInSol = valueInSOL  ? Number(valueInSOL) - initialInSOL : NaN;
  }

  ctx.session.userProfit = profitPercentage

  // const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;




      fullMessage += `<b>${pos.name} (${pos.symbol})</b> | <code>${pos.baseMint}</code>\n` +
        `Mcap: ${Mcap} <b>USD</b>\n` +
        `Initial: ${initialInSOL.toFixed(4)} <b>SOL</b> | ${initialInUSD.toFixed(4)} <b>USD </b>\n` +
        `Current value: ${valueInSOL  ? valueInSOL.toFixed(4) : NaN} <b>SOL</b> | ${valueInUSD  ? valueInUSD.toFixed(4) : NaN} <b>USD </b>\n` +
        `Profit: ${profitInSol  ? Number(profitInSol).toFixed(4) : NaN} <b>SOL</b> | ${profitInUSD  ? Number(profitInUSD).toFixed(4) : NaN} <b>USD</b> | ${profitPercentage ? Number(profitPercentage).toFixed(2) : NaN}%\n\n` +
        `Token Balance: ${userShitbalance.userTokenBalance.toFixed(4)} <b>${pos.symbol}</b> | ${(Number(userShitbalance.userTokenBalance) * Number(tokenPrice)).toFixed(4)} <b>USD</b> |${(Number(userShitbalance.userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} <b>SOL</b>\n\n`+

        `Wallet Balance: <b>${balanceInSOL.toFixed(4)}</b> SOL | <b>${(
          balanceInSOL * solPrice
        ).toFixed(2)}</b> USD\n`;
  

    };
    let keyboardButtons = createKeyboardForPosition(currentIndex);

    let options = {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: keyboardButtons },
    };
    if (isRefresh) {
      await ctx.editMessageText(fullMessage, options);
    } else {
      await ctx.api.sendMessage(ctx.chat.id, fullMessage, options);
    }
    // await ctx.api.sendMessage(ctx.chat.id, fullMessage, options);
  } catch (err) {
    console.error(err);

  }
}


export async function handleWallets(ctx: any) {
  const chatId = ctx.chat.id;
  const wallets = ctx.session.portfolio.wallets;
  const portfolioIndexWallet = await Portfolios.findOne({ chatId: chatId });
  let selectedWalletIndex: number;
  if(portfolioIndexWallet ){
   selectedWalletIndex = portfolioIndexWallet.activeWalletIndex; 
  }else{
   selectedWalletIndex = ctx.session.portfolio.activeWalletIndex; 
  }
  const connection = CONNECTION;


  if (!wallets || wallets.length === 0) {
      await ctx.api.sendMessage(chatId, "No wallets found. Please add a wallet first.");
      return;
  }
  const solanaDetails = await getSolanaDetails();
  let inlineKeyboardRows = [];

  for (const [index, wallet] of wallets.entries()) {
      const balanceInSOL = await getSolBalance(wallet.publicKey,connection);
      const balanceInUSD = balanceInSOL * solanaDetails;

      let walletIdentifier = wallet.publicKey;
      let isSelected = index === selectedWalletIndex; // Check if this wallet is selected

      let walletRow = [
          { 
              text: `${isSelected ? '✅ ' : ''}${index + 1}. ${walletIdentifier}`, 
              callback_data: `select_wallet_${index}`
          },
          { 
              text: `${balanceInSOL.toFixed(4)} SOL`, 
              callback_data: `wallet_balance_${index}`
          },
          { 
              text: `${balanceInUSD.toFixed(2)} USD`, 
              callback_data: `wallet_usd_${index}`
          }
      ];
      inlineKeyboardRows.push(walletRow);
  }
  inlineKeyboardRows.push([{ text: '🔄 Refresh', callback_data: 'refresh_db_wallets' }]);
  inlineKeyboardRows.push([{ text: 'Close', callback_data: 'closing' }]);

  const options = {
      reply_markup: {
          inline_keyboard: inlineKeyboardRows
      },
      parse_mode: 'HTML'
  };

  await ctx.api.sendMessage(chatId,"Please select a wallet to set your Settings, customize your keyboard, configure slippage & sending SOL:", options);

}
