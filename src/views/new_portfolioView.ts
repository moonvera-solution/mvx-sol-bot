
import { UserPositions } from '../db';
import { PublicKey } from '@metaplex-foundation/js';
import { TOKEN_PROGRAM_ID } from '@raydium-io/raydium-sdk';
import { getTokenDataFromBirdEyePositions } from "../api/priceFeeds/birdEye";

import { formatNumberToKOrM, getSolBalance } from '../service/util';
import { Connection } from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import { Position, UserPosition } from '../service/portfolio/positions';
import { getTokenMetadata, getUserTokenBalanceAndDetails } from '../service/feeds';
import { SOL_ADDRESS } from '../config';
import { getSwapDetails } from '../service/dex/solTracker';


export async function display_all_positions(ctx: any, isRefresh: boolean) {
  const { publicKey: userWallet } = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex] || {};
  if (!userWallet) return ctx.api.sendMessage(ctx.chat.id, "Wallet not found.", { parse_mode: 'HTML' });
  const userPosition = await UserPositions.find(
    {
      positionChatId: ctx.chat.id,
      walletId: userWallet
    },
    {
      positions: { $slice: -10 }
    }
  );
  if (!userPosition.length || !userPosition[0].positions.length) {
    return ctx.api.sendMessage(ctx.chat.id, "No active positions.", { parse_mode: 'HTML' });
  }
  const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
  let positionlKeys: any[] = [];

  const tokenBalances = await Promise.all(userPosition[0].positions.map(pos =>
    connection.getParsedTokenAccountsByOwner(
      new PublicKey(userWallet),
      {
        mint: new PublicKey(pos.baseMint),
        programId: TOKEN_PROGRAM_ID
      }
    )
  ));

    const messagePartsPromises = userPosition[0].positions.map(async (pos, i) => {
    const tokenAccountInfo = tokenBalances[i];
    const userBalance = new BigNumber(tokenAccountInfo.value[0]?.account.data.parsed.info.tokenAmount.amount || 0);
    if (pos.amountIn == 0 || pos.amountOut == 0 || pos.amountOut! < 0 || pos.amountIn < 0 || userBalance.toNumber() == 0) {
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
      const [birdeyeData, jupRate,tokenMetadataResult,userTokenDetails] = await Promise.all([
        getTokenDataFromBirdEyePositions(mint,userWallet),
        fetch(
          `https://price.jup.ag/v6/price?ids=${mint}&vsToken=So11111111111111111111111111111111111111112`
        ).then((response) => response.json()),
        getTokenMetadata(ctx, mint),
        getUserTokenBalanceAndDetails(new PublicKey(userWallet), new PublicKey(mint), connection),

      ]);
      const tradeDex = pos.tradeType

      return formatPositionMessage(pos, userBalance, birdeyeData,tradeDex,jupRate,tokenMetadataResult,userTokenDetails);
    });



  const fullMessage = (await Promise.all(messageParts)).join('');

  await sendMessage(ctx, fullMessage, isRefresh);
}

async function formatPositionMessage(
  pos: Position,
  userBalance: BigNumber,
  birdeyeData: any,
  tradeDex: string,
  jupRate: any,
  tokenMetadataResult: any,
  userTokenDetails: any
): Promise<string> {

let tokenPriceUSD = 0;

const jupTokenValue: any =  Object.values(jupRate.data);
let jupTokenPrice = 0;
if(jupTokenValue[0] && jupTokenValue[0].price ){
  jupTokenPrice = jupTokenValue[0].price;

}
const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.data.value : 0;
if (tradeDex.includes('jup_swap') || tradeDex.includes('ray_swap')) {
  tokenPriceUSD = birdeyeData
  && birdeyeData.response
  && birdeyeData.response.data
  && birdeyeData.response.data.data
  && birdeyeData.response.data.data.price != null  // This checks for both null and undefined
  ? birdeyeData.response.data.data.price
  : jupTokenPrice;
}else {
 const tokenRatePuMP =  await getSwapDetails(pos.baseMint,SOL_ADDRESS, 1, 0 )
  tokenPriceUSD = tokenRatePuMP * solPrice;
}


  const tokenPriceSOL = tokenPriceUSD / solPrice;
  const {
    tokenData,
  } = tokenMetadataResult;
  const baseDecimals = tokenData.mint.decimals;
  const totalSupply = new BigNumber(tokenData.mint.supply.basisPoints);
  const Mcap = await formatNumberToKOrM(Number(totalSupply.dividedBy(Math.pow(10, baseDecimals)).times(tokenPriceUSD)));
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
    valueInUSD = (pos.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, baseDecimals))) < 5 ? userTokenDetails.userTokenBalance * Number(tokenPriceUSD) : 'N/A';
    valueInSOL = (pos.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, baseDecimals))) < 5 ? Number(((userTokenDetails.userTokenBalance)) * Number(tokenPriceSOL)) : 'N/A';
    profitPercentage = valueInSOL != 'N/A' ? (Number(valueInSOL) - (Number(pos.amountIn) / 1e9)) / (Number(pos.amountIn) / 1e9) * 100 : 'N/A';
    profitInUSD = valueInUSD != 'N/A' ? Number(Number(userTokenDetails.userTokenBalance) * Number(tokenPriceUSD)) - initialInUSD : 'N/A';
    profitInSol = valueInSOL != 'N/A' ? (valueInSOL - initialInSOL).toFixed(4) : 'N/A';

  }
  const userTokenBalance = birdeyeData 
  && birdeyeData.walletTokenPosition
  && birdeyeData.walletTokenPosition.data
  && birdeyeData.walletTokenPosition.data.data
  && birdeyeData.walletTokenPosition.data.data.balance > 0
  && birdeyeData.walletTokenPosition.data.data.valueUsd > 0
  ? birdeyeData.walletTokenPosition.data.data.uiAmount : (userTokenDetails.userTokenBalance / Math.pow(10, userTokenDetails.decimals));

  
  // const baseSupply = birdeyeData
  // && birdeyeData.response
  // && birdeyeData.response.data
  // && birdeyeData.response.data.data
  // && birdeyeData.response.data.data.supply != null  // This checks for both null and undefined
  // ? birdeyeData.response.data.data.supply
  // : Number(tokenInfo.baseTokenSupply.dividedBy(Math.pow(10, poolKeys.baseDecimals)));
  // const mcap = baseSupply * tokenPriceUSD;  

  // const formattedMarketCap = new Intl.NumberFormat('en-US', { notation: "compact" }).format(Mcap);

  // Composing the message
  return `<b>${pos.name} (${pos.symbol})</b> | <code>${pos.baseMint}</code>\n` +
    `Mcap: ${Mcap} <b>USD</b>\n` +
    `Initial: ${Number(initialInSOL).toFixed(4)} <b>SOL</b> | ${Number(initialInUSD).toFixed(4)} <b>USD</b>\n` +
    `Current value: ${valueInSOL !== 'N/A' ? Number(valueInSOL).toFixed(4) : 'N/A'} <b>SOL</b> | ${valueInUSD !== 'N/A' ? Number(valueInUSD).toFixed(4) : 'N/A'} <b>USD</b>\n` +
    `Profit: ${profitInSol !== 'N/A' ? Number(profitInSol).toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD !== 'N/A' ? Number(profitInUSD).toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage !== 'N/A' ? Number(profitPercentage).toFixed(2) : 'N/A'}%\n\n` +
    `Token Balance: ${userTokenBalance.toFixed(4)} <b>${pos.symbol}</b> | ${((userTokenBalance) * Number(tokenPriceUSD)).toFixed(4)}<b>USD</b> |${((userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} <b>SOL</b>\n\n`;
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
  console.log('updatedPools', updatedPools);
  return updatedPools;
}

export async function display_single_position(ctx: any, isRefresh: boolean) {
  const chatId = ctx.chat.id;
  const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex]?.publicKey;
  const userPosition: any = await UserPositions.find(
    {
      positionChatId: chatId,
      walletId: userWallet
    },
    {
      positions: { $slice: -10 }
    }
  );
  const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
  if (!userPosition[0] || userPosition[0].positions.length === 0) {
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
    console.log('tokenzzz', token);
    const tokenAccountInfo = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(userWallet),
      {
        mint: new PublicKey(token),
        programId: TOKEN_PROGRAM_ID
      }
    );
  
    let userBalance = new BigNumber(
      tokenAccountInfo.value[0]
      && tokenAccountInfo.value[0].account.data.parsed.info.tokenAmount.amount
    );

    if (
      pos.amountIn == 0
      || pos.amountOut == 0
      || pos.amountOut < 0
      || pos.amountIn < 0
      || userBalance.toNumber() == 0
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
      console.log('pos', pos);
      const token = String(pos.baseMint);
      const tradeDex = String(pos.tradeType);
      ctx.session.swaptypeDex = pos.tradeType;
      const tokenAccountInfo = await connection.getParsedTokenAccountsByOwner(new PublicKey(userWallet), { mint: new PublicKey(token), programId: TOKEN_PROGRAM_ID });
      let userBalance = new BigNumber(tokenAccountInfo.value[0] && tokenAccountInfo.value[0].account.data.parsed.info.tokenAmount.amount);

      if (
        pos.amountIn == 0
        || pos.amountOut == 0
        || pos.amountOut < 0
        || pos.amountIn < 0
        || userBalance.toNumber() == 0
      ) {
        await UserPositions.updateOne({ walletId: userWallet }, { $pull: { positions: { baseMint: pos.baseMint } } })
          .then(() => { ctx.session.positionIndex = 0; currentIndex = 0; });
        return;
      }

      if (!userBalance.gt(0)) {
        await UserPositions.updateOne({ walletId: userWallet }, { $pull: { positions: { baseMint: token } } })
          .then(() => { ctx.session.positionIndex = 0; currentIndex = 0; });
        return;
      }
      const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`


      const [balanceInSOL, birdeyeData, jupRate,userTokenDetails,tokenMetadataResult, jupPriceImpact_5,
      ] = await Promise.all([
        getSolBalance(userWallet, connection),
        getTokenDataFromBirdEyePositions(token,userWallet),
        fetch(
          `https://price.jup.ag/v6/price?ids=${token}&vsToken=So11111111111111111111111111111111111111112`
        ).then((response) => response.json()),
        getUserTokenBalanceAndDetails(new PublicKey(userWallet), new PublicKey(token), connection),
        getTokenMetadata(ctx, token),
        fetch(
          `${rpcUrl}/jupiter/quote?inputMint=${SOL_ADDRESS}&outputMint=${token}&amount=${'5000000000'}&slippageBps=${1}`
        ).then((response) => response.json()),

      ]);
      const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.data.value : 0;
      console.log('solPrice', solPrice);
      let tokenPriceUSD = 0;

        const jupTokenValue: any =  Object.values(jupRate.data);
        let jupTokenPrice = 0;
        if(jupTokenValue[0] && jupTokenValue[0].price ){
          jupTokenPrice = jupTokenValue[0].price;   
        }
      if (tradeDex.includes('jup_swap') || tradeDex.includes('ray_swap')) {
        tokenPriceUSD = birdeyeData
        && birdeyeData.response
        && birdeyeData.response.data
        && birdeyeData.response.data.data
        && birdeyeData.response.data.data.price != null  // This checks for both null and undefined
        ? birdeyeData.response.data.data.price
        : jupTokenPrice;
      }else {
        const tokenRatePuMP =  await getSwapDetails(pos.baseMint,SOL_ADDRESS, 1, 0 )
         tokenPriceUSD = tokenRatePuMP * solPrice;
         console.log('tokenPricePUMP', tokenPriceUSD);
       }
      console.log('birdeyeData.response.data.data.price', birdeyeData?.response.data.data.price);
     
     
      const {
        tokenData,
      } = tokenMetadataResult;
      const baseDecimals = tokenData.mint.decimals;
      const totalSupply = new BigNumber(tokenData.mint.supply.basisPoints);
      console.log('totalSupply', Number(totalSupply));
      console.log('tokeprice', tokenPriceUSD);
      const Mcap = await formatNumberToKOrM(Number(totalSupply.dividedBy(Math.pow(10, baseDecimals)).times(tokenPriceUSD)));
      const tokenPriceSOL = Number(tokenPriceUSD) / Number(solPrice);
      console.log('tokenPriceSOL', tokenPriceSOL);
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
    valueInUSD = (pos.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, baseDecimals))) < 5 ? userTokenDetails.userTokenBalance * Number(tokenPriceUSD) : 'N/A';
    valueInSOL = (pos.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, baseDecimals))) < 5 ? Number(((userTokenDetails.userTokenBalance)) * Number(tokenPriceSOL)) : 'N/A';
    profitPercentage = valueInSOL != 'N/A' ? (Number(valueInSOL) - (Number(pos.amountIn) / 1e9)) / (Number(pos.amountIn) / 1e9) * 100 : 'N/A';
    profitInUSD = valueInUSD != 'N/A' ? Number(Number(userTokenDetails.userTokenBalance) * Number(tokenPriceUSD)) - initialInUSD : 'N/A';
    profitInSol = valueInSOL != 'N/A' ? (valueInSOL - initialInSOL).toFixed(4) : 'N/A';

  }
  const userTokenBalance = birdeyeData 
  && birdeyeData.walletTokenPosition
  && birdeyeData.walletTokenPosition.data
  && birdeyeData.walletTokenPosition.data.data
  && birdeyeData.walletTokenPosition.data.data.balance > 0
  && birdeyeData.walletTokenPosition.data.data.valueUsd > 0
  ? birdeyeData.walletTokenPosition.data.data.uiAmount : (userTokenDetails.userTokenBalance / Math.pow(10, userTokenDetails.decimals));
  console.log('userTokenBalance', userTokenBalance);
  const netWorth = birdeyeData
  && birdeyeData.birdeyePosition
  && birdeyeData.birdeyePosition.data
  && birdeyeData.birdeyePosition.data.data
  && birdeyeData.birdeyePosition.data.data.totalUsd
  ? birdeyeData.birdeyePosition.data.data.totalUsd : NaN;

    const netWorthSol = netWorth / solPrice;
  console.log('balnceInSOL', userTokenBalance * Number(tokenPriceSOL));
      fullMessage += `<b>${pos.name} (${pos.symbol})</b> | <code>${pos.baseMint}</code>\n` +
        `Mcap: ${Mcap} <b>USD</b>\n` +
        `Initial: ${initialInSOL.toFixed(4)} <b>SOL</b> | ${initialInUSD.toFixed(4)} <b>USD </b>\n` +
        `Current value: ${valueInSOL != 'N/A' ? valueInSOL.toFixed(4) : 'N/A'} <b>SOL</b> | ${valueInUSD != 'N/A' ? valueInUSD.toFixed(4) : 'N/A'} <b>USD </b>\n` +
        `Profit: ${profitInSol != 'N/A' ? Number(profitInSol).toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD != 'N/A' ? Number(profitInUSD).toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage != 'N/A' ? Number(profitPercentage).toFixed(2) : 'N/A'}%\n\n` +
        `Token Balance: ${userTokenBalance.toFixed(4)} <b>${pos.symbol}</b> | ${(Number(userTokenBalance) * Number(tokenPriceUSD)).toFixed(4)} <b>USD</b> |${(Number(userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} <b>SOL</b>\n\n`+

        `Wallet Balance: <b>${balanceInSOL.toFixed(4)}</b> SOL | <b>${(
          balanceInSOL * solPrice
        ).toFixed(2)}</b> USD\n`+
        `Net Worth: <b>${netWorthSol.toFixed(4)}</b> SOL | <b>${netWorth.toFixed(4)}</b> USD\n` ;
  

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

