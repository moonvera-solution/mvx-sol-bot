import { PublicKey } from "@solana/web3.js";
import {
  getTokenMetadata,
  getuserShitBalance,
  getUserTokenBalanceAndDetails,
} from "../../service/feeds";
import {CONNECTION} from "../../config";
import { formatNumberToKOrM, getSolBalance, optimizedSendAndConfirmTransaction } from "../../service/util";
import { Keypair, Connection } from "@solana/web3.js";
import { getSolanaDetails, memeTokenPrice } from "../../api/priceFeeds/birdEye";
import {  OrderHistoryItem } from "@jup-ag/limit-order-sdk";
import { jupiter_limit_order, cancelOrder, cancelBatchOrder, CalculateLimitOrderAmountout, fetchOpenOrders, calculateOrderSellAmount } from "../../../src/service/dex/jupiter/trade/LimitOrder";
import { SOL_ADDRESS } from "../../config";
import bs58 from 'bs58';
import BigNumber from "bignumber.js";

export async function submit_limitOrder(ctx: any) {
  try{

  const chatId = ctx.chat.id;
  const walletIdx = ctx.session.portfolio.activeWalletIndex;
  const wallet = ctx.session.portfolio.wallets[walletIdx];
  const userTokenBalanceAndDetails = await getUserTokenBalanceAndDetails(new PublicKey(wallet.publicKey), ctx.session.limitOrders_token, CONNECTION);
  const userWallet: Keypair = Keypair.fromSecretKey(bs58.decode(String(wallet.secretKey)));
  const isBuySide = ctx.session.limitOrders_side == "buy";
  const amountIn = ctx.session.limitOrders_amount;
  const tokenIn = isBuySide ? SOL_ADDRESS : ctx.session.limitOrders_token;
  const tokenOut = isBuySide ? ctx.session.limitOrders_token : SOL_ADDRESS;
  const connection = CONNECTION;
  const _symbol = userTokenBalanceAndDetails.userTokenSymbol;
  const referralInfo = { referralWallet: ctx.session.referralWallet, referralCommision: ctx.referralCommision, priorityFee: ctx.session.priorityFees };
  const targetPrice = ctx.session.limitOrders_price;
  const expiredAt = ctx.session.limitOrders_time ? new Date(ctx.session.limitOrders_time) : null;
  await ctx.api.sendMessage(chatId, `🟢 <b>Submitting a ${ctx.session.limitOrders_side.toUpperCase()}:</b> order... \n Please wait for confirmation.`, { parse_mode: 'HTML', disable_web_page_preview: true });


  jupiter_limit_order(ctx, connection, referralInfo, isBuySide, {
    userWallet: userWallet,
    inputToken: tokenIn,
    inAmount: amountIn,
    outputToken: tokenOut,
    targetPrice: targetPrice,
    expiredAt: expiredAt,
  }).then(async (txSig: any) => {
    if (!txSig) return;
    if(txSig){
      const config = {
        searchTransactionHistory: true
      };
      const tradeType = isBuySide ? 'buy' : 'sell';
      const sigStatus = await connection.getSignatureStatus(txSig, config)
      if (sigStatus?.value?.err) {
        await ctx.api.sendMessage(chatId, `❌ ${tradeType.toUpperCase()} tx failed. Please try again.`, { parse_mode: 'HTML', disable_web_page_preview: true });
        return;
      }

      const confirmMsg = `🟢 <b>The ${tradeType.toUpperCase()} order for ${_symbol} is submitted</b>. ` + 
        ` <a href="https://solscan.io/tx/${txSig}">View transaction</a> on Solscan.\n`+
        `The order will be executed when the price reaches ${(targetPrice).toFixed(9)} SOL.`;
      await ctx.api.sendMessage(chatId, confirmMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
      ctx.session.latestCommand = 'jupiter_swap';
    }
  });
}
catch (err) {
  console.error(err);
  console.log("Error limit order.");
}
}
export async function submit_limitOrder_sell(ctx: any) {
  try{

  const chatId = ctx.chat.id;
  const walletIdx = ctx.session.portfolio.activeWalletIndex;
  const wallet = ctx.session.portfolio.wallets[walletIdx];
  const userTokenBalanceAndDetails = await getUserTokenBalanceAndDetails(new PublicKey(wallet.publicKey), ctx.session.limitOrders_token, CONNECTION);
  const userWallet: Keypair = Keypair.fromSecretKey(bs58.decode(String(wallet.secretKey)));
  const amountIn = (ctx.session.limitOrders_amount);
  const isBuySide = ctx.session.limitOrders_side == "buy";
  const tokenIn = isBuySide ? SOL_ADDRESS : ctx.session.limitOrders_token;
  const tokenOut = isBuySide ? ctx.session.limitOrders_token : SOL_ADDRESS;
  
  const connection = CONNECTION;
  const _symbol = userTokenBalanceAndDetails.userTokenSymbol;
  const referralInfo = { referralWallet: ctx.session.referralWallet, referralCommision: ctx.referralCommision, priorityFee: ctx.session.priorityFees };
  const targetPrice = ctx.session.limitOrders_price;
  const expiredAt = ctx.session.limitOrders_time ? new Date(ctx.session.limitOrders_time) : null;
  await ctx.api.sendMessage(chatId, `🟢 <b>Submitting a ${ctx.session.limitOrders_side.toUpperCase()}:</b> order... \n Please wait for confirmation.`, { parse_mode: 'HTML', disable_web_page_preview: true });


  jupiter_limit_order(ctx, connection, referralInfo, isBuySide, {
    userWallet: userWallet,
    inputToken: tokenIn,
    inAmount: amountIn,
    outputToken: tokenOut,
    targetPrice: targetPrice,
    expiredAt: expiredAt,
  }).then(async (txSig: any) => {
    if (!txSig) return;
    if(txSig){
      const config = {
        searchTransactionHistory: true
      };
      const tradeType = isBuySide ? 'buy' : 'sell';

      const sigStatus = await connection.getSignatureStatus(txSig, config)
      if (sigStatus?.value?.err) {
        await ctx.api.sendMessage(chatId, `❌ ${tradeType.toUpperCase()} tx failed. Please try again.`, { parse_mode: 'HTML', disable_web_page_preview: true });
        return;
      }

      const confirmMsg = `🟢 <b>The ${tradeType.toUpperCase()} order for ${_symbol} is submitted</b>. ` + 
        ` <a href="https://solscan.io/tx/${txSig}">View transaction</a> on Solscan.\n`+
        `The order will be executed when the price reaches ${(targetPrice).toFixed(9)} SOL.`;
      await ctx.api.sendMessage(chatId, confirmMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
      ctx.session.latestCommand = 'jupiter_swap';

    }
   
  });
} catch (err) {
  console.error(err);
  console.log("Error limit order sell.");
}
}

export async function review_limitOrder_details(ctx: any, isRefresh: boolean) {
  try{

  const timeTxt = ctx.session.limitOrders_time ? new Date(ctx.session.limitOrders_time).toLocaleString() : "NA";
  const baseMint = ctx.session.limitOrders_token.toBase58();
  // console.log('baseMint',baseMint);
  const tokenAddress = new PublicKey(baseMint);
  const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
  let swapUrlSol = `${rpcUrl}/jupiter/quote?inputMint=${'So11111111111111111111111111111111111111112'}&outputMint=${'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'}&amount=${1000000000}&slippageBps=${0}`.trim();
  const headers = { 'x-api-key': `${process.env.SOL_TRACKER_API_DATA_KEY}` };
  const urlTrack = `https://data.solanatracker.io/price?token=${baseMint}`;
  const[tokenMetadataResult,expectedAmountOut, solTrackerData, jupSolPrice] = await Promise.all([
    getTokenMetadata(ctx, tokenAddress.toBase58()),
    CalculateLimitOrderAmountout(SOL_ADDRESS, ctx.session.limitOrders_amount, ctx.session.limitOrders_token, ctx.session.limitOrders_price, ctx),
    fetch(urlTrack,{headers}).then((response) => response.json()),
    fetch(swapUrlSol).then(res => res.json())
  ]);
  
  // console.log('jupTokenRate',jupTokenRate.data);


  const birdeyeURL = `https://birdeye.so/token/${baseMint}?chain=solana`;
  const dextoolsURL = `https://www.dextools.io/app/solana/pair-explorer/${baseMint}`;
  const dexscreenerURL = `https://dexscreener.com/solana/${baseMint}`;
  const decimalsToken = tokenMetadataResult.tokenData.mint.decimals;
  let solPrice = 0 ;
      
  if(jupSolPrice && jupSolPrice.outAmount){
    solPrice = Number(jupSolPrice.outAmount / 1e6);
  } else {
    await getSolanaDetails().then((data) => {
      solPrice = data;
    });
  }
  let tokenPrice = 0;


  if (solTrackerData && (solTrackerData.error == null || solTrackerData.error == undefined)) {
    tokenPrice = solTrackerData.price; ;
  } else {
    await memeTokenPrice(baseMint).then((data) => {
      tokenPrice = data;
    })
  }
  const tokenPriceUSD =  Number(baseMint) ;
  const tokenPriceSOL = tokenPriceUSD / solPrice;
  let orderSummary =
    `📄 <b> Order Summary</b> \n\n` +
    `👁️ <a href="${birdeyeURL}">Birdeye View</a> | ` +
    `🛠 <a href="${dextoolsURL}">Dextools Analysis</a> | ` +
    `🔍 <a href="${dexscreenerURL}">Dexscreener</a>\n\n` +
    `<b>Token: </b>  ${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol}) | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
    `<b>Current Token Price: ${tokenPriceSOL.toFixed(9)} SOL</b> | <b>${(tokenPriceUSD).toFixed(4)} USD</b> \n` +
    `<b>Order type: </b> ${ctx.session.limitOrders_side} \n` +
    `<b>SOL Amount: </b> ${ctx.session.limitOrders_amount}  \n` +
    `<b>Target Price: </b> ${(ctx.session.limitOrders_price).toFixed(9)} <b>SOL</b>  \n` +
    `<b>Expected Amount ≅ </b> ${(expectedAmountOut / Math.pow(10,decimalsToken)).toFixed(3)} $${tokenMetadataResult.tokenData.symbol}  \n` +
    `<b>Expiration: </b> ${timeTxt}  \n`;

  const options = {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: ` Submit `, callback_data: "submit_limit_order" }, { text: ` Cancel `, callback_data: "closing" }],
        [{ text: `Refresh`, callback_data: "refresh_review_limit_order" }],
      ]
    }
  }
  if (isRefresh) {
    await ctx.editMessageText(orderSummary, options);
  } else {
  await ctx.api.sendMessage(ctx.chat.id, orderSummary, options);
  }
} catch (err) {
  console.error(err);
  console.log("Error limit order.");
}
}
export async function review_limitOrder_details_sell(ctx: any, isRefresh: boolean) {
  try{

  const timeTxt = ctx.session.limitOrders_time ? new Date(ctx.session.limitOrders_time).toLocaleString() : "NA";
  const baseMint = ctx.session.limitOrders_token;
  const tokenAddress = new PublicKey(baseMint);
  const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
  let swapUrlSol = `${rpcUrl}/jupiter/quote?inputMint=${'So11111111111111111111111111111111111111112'}&outputMint=${'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'}&amount=${1000000000}&slippageBps=${0}`.trim();
  const headers = { 'x-api-key': `${process.env.SOL_TRACKER_API_DATA_KEY}` };
  const urlTrack = `https://data.solanatracker.io/price?token=${baseMint}`;
  const[tokenMetadataResult,expectedAmountOut,solTrackerData, jupSolPrice] = await Promise.all([
    getTokenMetadata(ctx, tokenAddress.toBase58()),
    calculateOrderSellAmount(ctx.session.limitOrders_token.toBase58(), ctx.session.limitOrders_amount, SOL_ADDRESS, ctx.session.limitOrders_price,ctx),
    fetch(urlTrack,{headers}).then((response) => response.json()),
    fetch(swapUrlSol).then(res => res.json())
  ]);
  const birdeyeURL = `https://birdeye.so/token/${baseMint}?chain=solana`;
  const dextoolsURL = `https://www.dextools.io/app/solana/pair-explorer/${baseMint}`;
  const dexscreenerURL = `https://dexscreener.com/solana/${baseMint}`;
  const decimalsToken = tokenMetadataResult.tokenData.mint.decimals;
  let solPrice = 0 ;
  console.log('expectedAmountOut',expectedAmountOut);
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
  if (solTrackerData && (solTrackerData.error == null || solTrackerData.error == undefined)) {
    tokenPrice = solTrackerData.price; ;
      } else {
        await memeTokenPrice(baseMint).then((data) => {
          tokenPrice = data;
        })
      }
      const tokenPriceUSD =  Number(tokenPrice) ;
      const tokenPriceSOL = tokenPriceUSD / solPrice;
    const SellingAmount = ctx.session.limitOrders_amount / Math.pow(10,decimalsToken);
    // console.log('tokendecimals',decimalsToken);
  let orderSummary =
    `📄 <b> Order Summary</b> \n\n` +
    `👁️ <a href="${birdeyeURL}">Birdeye View</a> | ` +
    `🛠 <a href="${dextoolsURL}">Dextools Analysis</a> | ` +
    `🔍 <a href="${dexscreenerURL}">Dexscreener</a>\n\n` +
    `<b>Token: </b>  ${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol}) | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
    `<b>Current Token Price: ${tokenPriceSOL.toFixed(9)} SOL</b> | <b>${(tokenPriceUSD).toFixed(4)} USD</b> \n` +
    `<b>Order type: </b> ${ctx.session.limitOrders_side} \n` +
    `<b>Token Amount to sell: </b> ${SellingAmount} <b>${tokenMetadataResult.tokenData.symbol}</b> \n` +
    `<b>Target Price: </b> ${(ctx.session.limitOrders_price).toFixed(9)} <b>SOL</b>  \n` +
    `<b>Expected Amount ≅ </b> ${(expectedAmountOut / Math.pow(10,9)).toFixed(4)} $SOL  \n` +
    `<b>Expiration: </b> ${timeTxt}  \n`;

  const options = {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: ` Submit `, callback_data: "submit_limit_order_sell" }, { text: ` Cancel `, callback_data: "closing" }],
        [{ text: `Refresh`, callback_data: "refresh_review_limit_order_sell" }],
      ]
    }
  }
  if (isRefresh) {
    await ctx.editMessageText(orderSummary, options);
  } else {
  await ctx.api.sendMessage(ctx.chat.id, orderSummary, options);
  }
} catch (err) {
  console.error(err);
  console.log("Error limit order sell.");
}

}

export async function display_limitOrder_token_details(ctx: any, isRefresh: boolean) {
  try {
  const tokenAddress= (ctx.session.limitOrders_token.toBase58());
  const chatId = ctx.chat.id;
  let userWallet: any;
  const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
  const connection = new Connection(rpcUrl);

  if (ctx.session.portfolio) {
    const selectedWallet = ctx.session.portfolio.activeWalletIndex;
    userWallet = ctx.session.portfolio.wallets[selectedWallet];
  }  
  const publicKeyString: any = userWallet.publicKey;
  if(tokenAddress){
    const feeAccount = null;
    let swapUrl = `${rpcUrl}/jupiter/quote?inputMint=${SOL_ADDRESS}&outputMint=${tokenAddress}&amount=${1}&slippageBps=${ctx.session.latestSlippage}${feeAccount ? '&platformFeeBps=08' : ''}`.trim();
    let swapUrlSol = `${rpcUrl}/jupiter/quote?inputMint=${'So11111111111111111111111111111111111111112'}&outputMint=${'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'}&amount=${1000000000}&slippageBps=${0}`.trim();
    const headers = { 'x-api-key': `${process.env.SOL_TRACKER_API_DATA_KEY}` };
    const urlTrack = `https://data.solanatracker.io/price?token=${tokenAddress}`;
    const [
      shitBalance,
      tokenMetadataResult,
      getSolBalanceData,
      solTrackerData,
      userTokenDetails,
      jupSolPrice,
      quoteResponse
    ] = await Promise.all([
      getuserShitBalance(publicKeyString,tokenAddress, connection),
      getTokenMetadata(ctx, tokenAddress),
      getSolBalance(publicKeyString, connection),
      fetch(urlTrack,{headers}).then((response) => response.json()),
      getUserTokenBalanceAndDetails(new PublicKey(publicKeyString), tokenAddress, connection),
      fetch(swapUrlSol).then(res => res.json()),
      fetch(swapUrl).then(res => res.json())
    ]);
    const {
      birdeyeURL,
      dextoolsURL,
      dexscreenerURL,
    } = tokenMetadataResult;
    // console.log('jupTokenValue',jupTokenValue);
    if(quoteResponse?.errorCode === 'TOKEN_NOT_TRADABLE'){  
      await ctx.api.sendMessage(chatId, `🔴 <b>Sorry you cannot sert a limit order for this token at the moment, try later.</b> `, { parse_mode: "HTML" });
      return;
    }
  
    const {
      tokenData,
    } = tokenMetadataResult;
    let solPrice = 0 ;
      
    if(jupSolPrice && jupSolPrice.outAmount){
      solPrice = Number(jupSolPrice.outAmount / 1e6);
    } else {
      await getSolanaDetails().then((data) => {
        solPrice = data;
      });
    }    
    // TOken price from jup
    let tokenPrice = 0;
    if (solTrackerData && (solTrackerData.error == null || solTrackerData.error == undefined)) {
      tokenPrice = solTrackerData.price; ;
      } else {
        await memeTokenPrice(tokenAddress).then((data) => {
          tokenPrice = data;
        })
      }

    const tokenPriceUSD =  Number(tokenPrice) ;
    const tokenPriceSOL = tokenPriceUSD / solPrice;    const baseDecimals = tokenData.mint.decimals;
    const totalSupply = new BigNumber(tokenData.mint.supply.basisPoints);
    const Mcap = await formatNumberToKOrM(Number(totalSupply.dividedBy(Math.pow(10, baseDecimals)).times(tokenPriceUSD)));
    const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;

    let  messageText =
    `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
    `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
    `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
    `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
    `Market Cap: <b>${Mcap} USD</b>\n` +
    `Price:  <b>${tokenPriceSOL.toFixed(9)} SOL</b> | <b>${(tokenPriceUSD).toFixed(9)} USD</b> \n\n` +
    `Token Balance: <b>${shitBalance.userTokenBalance.toFixed(4)} $${userTokenSymbol} </b> | <b>${((shitBalance.userTokenBalance) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((shitBalance.userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n\n` +
    `Wallet balance: <b>${getSolBalanceData.toFixed(4)}</b> SOL | <b>${(getSolBalanceData * Number(solPrice)).toFixed(4)}</b> USD\n\n` +

    `<b>Limit Order Steps:</b>\n` +
    `1. Select order side buy or sell.\n` +
    `2. Enter the amount to buy/sell. (in SOL)\n` +
    `3. Set the target price. (in SOL)\n` +
    `3. Set the expiration time.\n` +
    `3. Set the target price to trigger your order.\n`;
    let options: any;


    options = {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: " 🔂 Refresh ", callback_data: "refresh_limit_order" }, { text: " ⚙️ Settings ", callback_data: "settings" },],
          [{ text: `Order: Buy`, callback_data: "set_limit_order_buy" }, { text: `Order: Sell  `, callback_data: "set_limit_order_sell" },],
          [{ text: "Cancel", callback_data: "closing" }]
        ]
      }
    };
    if (isRefresh) {
      await ctx.editMessageText(messageText, options);
    } else {
      await ctx.api.sendMessage(chatId, messageText, options);
    }
  }
        
       
  } catch (e) {
  console.log(e);
}
}
export async function display_open_orders(ctx: any, isRefresh: boolean) {
  try{

  const wallet: Keypair = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex].secretKey));
  const orders = await fetchOpenOrders(wallet);

  if (orders.length == 0) {
    await ctx.api.sendMessage(ctx.chat.id, 'You have no open orders at the moment.');
    return;
  }
  const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
  let swapUrlSol = `${rpcUrl}/jupiter/quote?inputMint=${'So11111111111111111111111111111111111111112'}&outputMint=${'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'}&amount=${1000000000}&slippageBps=${0}`.trim();
 
  let messageText = '';
  for (const order of orders) {
    
    console.log('order',order);
    let TokenTocheck = order.account.inputMint === SOL_ADDRESS ? order.account.outputMint : order.account.inputMint;
    const headers = { 'x-api-key': `${process.env.SOL_TRACKER_API_DATA_KEY}` };
    const urlTrack = `https://data.solanatracker.io/price?token=${TokenTocheck}`;
    const [tokenMetadataResult,  jupSolPrice,solTrackerData ] = await  Promise.all([
    getTokenMetadata(ctx, TokenTocheck),
    fetch(swapUrlSol).then(res => res.json()),
    fetch(urlTrack,{headers}).then((response) => response.json())


    ]);
    const TokenDec = tokenMetadataResult.tokenData.mint.decimals;

    // const birdeyeData = await getTokenDataFromBirdEye(order.account.outputMint, wallet.publicKey.toBase58());
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
       if (solTrackerData && (solTrackerData.error == null || solTrackerData.error == undefined)) {
        tokenPrice = solTrackerData.price; ;
      } else {
        await memeTokenPrice(TokenTocheck).then((data) => {
          tokenPrice = data;
        })
      }
    const tokenPriceUSD =  Number(tokenPrice) ;
    const tokenPriceSOL = tokenPriceUSD / solPrice;   
    const expiryDate = order.account.expiredAt !== null ? new Date(order.account.expiredAt) : 'N/A';
    const orderAmount = order.account.inputMint === SOL_ADDRESS ? order.account.oriInAmount / 1e9 : order.account.oriInAmount / Math.pow(10, TokenDec);
    const ExpectedTokenAmount = order.account.inputMint === SOL_ADDRESS ? order.account.outAmount / Math.pow(10, TokenDec) : order.account.outAmount / 1e9;
    const orderType = order.account.inputMint === SOL_ADDRESS ? 'Buy order' : 'Sell order';
    const symbolToUse = order.account.inputMint === SOL_ADDRESS ? 'SOL' : tokenMetadataResult.tokenData.symbol;
    let OutSymbol = order.account.outputMint === SOL_ADDRESS ? 'SOL' : tokenMetadataResult.tokenData.symbol;
    messageText +=
      `<b> 🗃️ Open Orders:</b> \n\n` +
      `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${TokenTocheck}</code> <a href="copy:${TokenTocheck}">🅲</a>\n` +
      `Order type: ${orderType} \n` +
      `Order Amount: ${orderAmount} <b>${symbolToUse}</b> \n` +
      `Expected amount: ${ExpectedTokenAmount} <b>${OutSymbol}</b> \n` +
      `Current Price: ${tokenPriceSOL.toFixed(9)} <b>${symbolToUse}</b> \n` +
      `Expiration: ${expiryDate} \n\n`;
  }

  const options = {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          { text: `Manage Orders`, callback_data: "manage_limit_orders" },
          { text: `Refresh Orders`, callback_data: "refresh_limit_orders" },
        ],
        [
          { text: `Cancel All Orders`, callback_data: "cancel_all_orders" }
        ],
      ]
    }
  }

  if (isRefresh) {
    await ctx.editMessageText(messageText, options);
  } else {
    await ctx.api.sendMessage(ctx.chat.id, messageText, options);
  }
  ctx.session.isOrdersLoaded = false;
} catch (e) {
  console.log(e);
}
}


export async function display_single_order(ctx: any, isRefresh: boolean) {
  try{

  const wallet: Keypair = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex].secretKey));
  
  let orders =  await fetchOpenOrders( wallet);
  ctx.session.orders = orders;

  if (orders.length > 0) {
    let index = ctx.session.orderIndex ?? 0;
    let order = orders[index];
    let messageText;
    let tokenAddress = order?.account.inputMint === SOL_ADDRESS ? order.account.outputMint : order.account.inputMint;
    const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
    let swapUrlSol = `${rpcUrl}/jupiter/quote?inputMint=${'So11111111111111111111111111111111111111112'}&outputMint=${'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'}&amount=${1000000000}&slippageBps=${0}`.trim();
    const headers = { 'x-api-key': `${process.env.SOL_TRACKER_API_DATA_KEY}` };
    const urlTrack = `https://data.solanatracker.io/price?token=${tokenAddress}`;
    const[tokenMetadataResult,solTrackerData, jupSolPrice] = await Promise.all([
      getTokenMetadata(ctx, tokenAddress),
      fetch(urlTrack,{headers}).then((response) => response.json()),
      fetch(swapUrlSol).then(res => res.json())
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
    if (solTrackerData && (solTrackerData.error == null || solTrackerData.error == undefined)) {
      tokenPrice = solTrackerData.price; ;
      } else {
        await memeTokenPrice(tokenAddress).then((data) => {
          tokenPrice = data;
        })
      }

    const tokenPriceUSD =  Number(tokenPrice) ;
    const tokenPriceSOL = tokenPriceUSD / solPrice;  
    const expiryDate = new Date(order.account.expiredAt?.toNumber());
    const expiry = order.account.expiredAt == null ? 'NO EXPIRY' : expiryDate.toLocaleString();
    let orderType = order.account.inputMint === 'So11111111111111111111111111111111111111112'? 'Buy order' : 'Sell order';
    let orderAmount = order.account.oriInAmount / 1e9;
    let ExpectedTokenAmount = order.account.outAmount / Math.pow(10, tokenMetadataResult.tokenData.mint.decimals);
    const symbolToUse = order.account.inputMint === SOL_ADDRESS ? 'SOL' : tokenMetadataResult.tokenData.symbol;
    let OutSymbol = order.account.outputMint === SOL_ADDRESS ? 'SOL' : tokenMetadataResult.tokenData.symbol;
  
    messageText =
      `<b>Ordered Token:</b> ${tokenMetadataResult.tokenData.name} ($${tokenMetadataResult.tokenData.symbol})\n` + 
      `📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
      `<b>Current Token Price:</b> ${tokenPriceSOL.toFixed(9)} <b>SOL</b> | ${(tokenPriceUSD).toFixed(9)} <b>USD</b> \n` +
      `<b>Order type:</b> ${orderType} \n` +
      `Order Amount: ${orderAmount} <b>${symbolToUse}</b> \n` +
      `<b>Expected amount</b> ${ExpectedTokenAmount} <b>$${OutSymbol}</b> \n` +
      `<b>Expiration:</b> ${expiry} \n` ;

    let prevIndex = index - 1 < 0 ? orders.length - 1 : index - 1;
    let nextIndex = index + 1 >= orders.length ? 0 : index + 1;

    console.log('order', order);

    const options = {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⏮️ Previous', callback_data: `prev_order_${prevIndex}` },
            { text: 'Next ⏭️', callback_data: `next_order_${nextIndex}` }
          ],
          [
            { text: `Cancel Order`, callback_data: `cancel_limit_orders_${order.publicKey}` },
            { text: `Refresh Order`, callback_data: "refresh_single_orders" },
          ],
        ]
      }
    }

    if (isRefresh) {
      await ctx.editMessageText(messageText, options);
    } else {

      await ctx.api.sendMessage(ctx.chat.id, messageText, options);
    }

  } else {
    await ctx.api.sendMessage(ctx.chat.id, 'your order list is empty.');
  }
}
catch(e){
  console.log(e);
}
}

export async function cancel_orders(ctx: any, tokenKey: string) {
  try{

  await ctx.api.sendMessage(ctx.session.chatId, '🟢  Cancelling order, please wait for confirmation.', { parse_mode: "HTML" });
  const wallet = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex].secretKey));
  console.log('limOrder tokenKey', tokenKey);
  const chatId = ctx.chat.id;

  const connection = CONNECTION;

 cancelOrder(connection, wallet, new PublicKey(tokenKey),ctx).then(async(txSig: any) => {
    if (!txSig) return;
    if(txSig){
      const config = {
        searchTransactionHistory: true
      };
      const sigStatus = await connection.getSignatureStatus(txSig, config)
      if (sigStatus?.value?.err) {
        await ctx.api.sendMessage(chatId, `❌  tx failed. Please try again later.`, { parse_mode: 'HTML', disable_web_page_preview: true });
        return;
      } else{
        await ctx.api.sendMessage(chatId, `🟢  Order cancelled successfully. <a href="https://solscan.io/tx/${txSig}">View Details</a>`, { parse_mode: 'HTML', disable_web_page_preview: true });
        display_single_order(ctx, true);
      }
    }
  });

  return;
}
catch(e){
  console.log(e);
}
}

export async function cancel_all_orders(ctx: any) {
  try{

  const wallet = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex].secretKey));
  const connection = CONNECTION;
  // console.log('wallet:', wallet.publicKey);
  const orders: OrderHistoryItem[] = await fetchOpenOrders( wallet);
  let orderKeys = orders.map((order) => order.publicKey);
  // console.log('orders:', orders);
  const chatId = ctx.chat.id;
  await ctx.api.sendMessage(chatId, '🟢  Cancelling all orders, please wait for confirmation.', { parse_mode: "HTML" });
  cancelBatchOrder(connection, wallet, orderKeys  as PublicKey[],ctx).then(async(txSig: any) => {
    if (!txSig) return;
    if(txSig){
      const config = {
        searchTransactionHistory: true
      };
      const sigStatus = await connection.getSignatureStatus(txSig, config)
      if (sigStatus?.value?.err) {
        await ctx.api.sendMessage(chatId, `❌  tx failed. Please try again later.`, { parse_mode: 'HTML', disable_web_page_preview: true });
        return;
      } else{
        await ctx.api.sendMessage(chatId, `🟢  Orders cancelled successfully. <a href="https://solscan.io/tx/${txSig}">View Details</a>`, { parse_mode: 'HTML', disable_web_page_preview: true });
        display_open_orders(ctx, true);
      }
    }
  });
} catch(e){
  console.log(e);
}

}

