import {CONNECTION, SOL_ADDRESS} from "../../../../config";
import { PublicKey } from "@solana/web3.js";
import { formatNumberToKOrM, getSolBalance } from "../../../../service/util";
import {
  getTokenMetadata,
  getuserShitBalance,
  getUserTokenBalanceAndDetails,
} from "../../../../service/feeds";
import { Keypair, Connection } from "@solana/web3.js";
import { getSolanaDetails, getTokenDataFromBirdEyePositions, memeTokenPrice } from "../../../../api/priceFeeds/birdEye";
import BigNumber from "bignumber.js";

export async function display_dca_details(ctx: any, isRefresh: boolean) {
  try {
  const tokenAddress= (ctx.session.dca_token);
  const chatId = ctx.chat.id;
  let userWallet: any;
  const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
  const connection = CONNECTION;

  if (ctx.session.portfolio) {
    const selectedWallet = ctx.session.portfolio.activeWalletIndex;
    userWallet = ctx.session.portfolio.wallets[selectedWallet];
  }  
  const publicKeyString: any = userWallet.publicKey;
  if(tokenAddress){
    const feeAccount = null;
    let swapUrl = `${rpcUrl}/jupiter/quote?inputMint=${SOL_ADDRESS}&outputMint=${tokenAddress}&amount=${1}&slippageBps=${ctx.session.latestSlippage}${feeAccount ? '&platformFeeBps=08' : ''}`.trim();
    let swapUrlSol = `${rpcUrl}/jupiter/quote?inputMint=${'So11111111111111111111111111111111111111112'}&outputMint=${'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'}&amount=${1000000000}&slippageBps=${0}`.trim();

    const [
      shitBalance,
      tokenMetadataResult,
      getSolBalanceData,
      jupTokenRate,
      userTokenDetails,
      jupSolPrice,
      quoteResponse
    ] = await Promise.all([
      getuserShitBalance(publicKeyString,tokenAddress, connection),
      getTokenMetadata(ctx, tokenAddress),
      getSolBalance(publicKeyString, connection),
      fetch( `https://api.jup.ag/price/v2?ids=${tokenAddress}&showExtraInfo=true`).then((response) => response.json()),
      getUserTokenBalanceAndDetails(new PublicKey(publicKeyString), tokenAddress, connection),
      fetch(swapUrlSol).then(res => res.json()),
      fetch(swapUrl).then(res => res.json())
    ]);
    const {
      birdeyeURL,
      dextoolsURL,
      dexscreenerURL,
    } = tokenMetadataResult;
    const jupTokenValue: any = Object.values(jupTokenRate.data);
    // console.log('jupTokenValue',jupTokenValue);
    let jupTokenPrice = 0;
    if(quoteResponse?.errorCode === 'TOKEN_NOT_TRADABLE' || jupTokenValue.length == 0){  
      await ctx.api.sendMessage(chatId, `🔴 <b>Sorry you cannot sert a limit order for this token at the moment, try later.</b> `, { parse_mode: "HTML" });
      return;
    }
    if (jupTokenValue[0] && jupTokenValue[0].price && quoteResponse?.errorCode !== 'TOKEN_NOT_TRADABLE') {
   
      jupTokenPrice = jupTokenValue[0].price;
      // console.log('jupToken_limitorder');
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
    if (jupTokenValue[0] && jupTokenValue[0].price) {
      jupTokenPrice = jupTokenValue[0].price ;
    } else {
      await memeTokenPrice(tokenAddress).then((data) => {
        jupTokenPrice = data;
      })
    } 

    const tokenPriceUSD =  Number(jupTokenPrice) ;
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

    `<b>DCA Steps:</b>\n` +
    `1. Enter the amount for DCA. (in SOL)\n` +
    `2. Enter the number of cycles (ex: How many times you want to buy the token).\n` +
    `3. Set the start time for the DCA.\n` +
    `4. Set the interval for the DCA.\n` ;
    let options: any;


    options = {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: " 🔂 Refresh ", callback_data: "refresh_dca" }, { text: " ⚙️ Settings ", callback_data: "settings" },],
          [{ text: "Entre Amount", callback_data: "dca_amount" }],
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

export async function dca_review(ctx: any, isRefresh: boolean) {

  try{

    const tokenAddress= (ctx.session.dca_token);
    const chatId = ctx.chat.id;
    let userWallet: any;
    const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
    const connection = CONNECTION;
  
    if (ctx.session.portfolio) {
      const selectedWallet = ctx.session.portfolio.activeWalletIndex;
      userWallet = ctx.session.portfolio.wallets[selectedWallet];
    }  
    const publicKeyString: any = userWallet.publicKey;

    if(tokenAddress){
      const feeAccount = null;
      let swapUrl = `${rpcUrl}/jupiter/quote?inputMint=${SOL_ADDRESS}&outputMint=${tokenAddress}&amount=${1}&slippageBps=${ctx.session.latestSlippage}${feeAccount ? '&platformFeeBps=08' : ''}`.trim();
      let swapUrlSol = `${rpcUrl}/jupiter/quote?inputMint=${'So11111111111111111111111111111111111111112'}&outputMint=${'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'}&amount=${1000000000}&slippageBps=${0}`.trim();
  
      const [
        shitBalance,
        tokenMetadataResult,
        getSolBalanceData,
        jupTokenRate,
        userTokenDetails,
        jupSolPrice,
        quoteResponse
      ] = await Promise.all([
        getuserShitBalance(publicKeyString,tokenAddress, connection),
        getTokenMetadata(ctx, tokenAddress),
        getSolBalance(publicKeyString, connection),
        fetch( `https://api.jup.ag/price/v2?ids=${tokenAddress}&showExtraInfo=true`).then((response) => response.json()),
        getUserTokenBalanceAndDetails(new PublicKey(publicKeyString), tokenAddress, connection),
        fetch(swapUrlSol).then(res => res.json()),
        fetch(swapUrl).then(res => res.json())
      ]);
      const {
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
      } = tokenMetadataResult;
      const jupTokenValue: any = Object.values(jupTokenRate.data);
      // console.log('jupTokenValue',jupTokenValue);
      let jupTokenPrice = 0;
      if(quoteResponse?.errorCode === 'TOKEN_NOT_TRADABLE' || jupTokenValue.length == 0){  
        await ctx.api.sendMessage(chatId, `🔴 <b>Sorry you cannot sert a limit order for this token at the moment, try later.</b> `, { parse_mode: "HTML" });
        return;
      }
      if (jupTokenValue[0] && jupTokenValue[0].price && quoteResponse?.errorCode !== 'TOKEN_NOT_TRADABLE') {
     
        jupTokenPrice = jupTokenValue[0].price;
        // console.log('jupToken_limitorder');
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
      if (jupTokenValue[0] && jupTokenValue[0].price) {
        jupTokenPrice = jupTokenValue[0].price ;
      } else {
        await memeTokenPrice(tokenAddress).then((data) => {
          jupTokenPrice = data;
        })
      } 
  
      const tokenPriceUSD =  Number(jupTokenPrice) ;
      const tokenPriceSOL = tokenPriceUSD / solPrice;    const baseDecimals = tokenData.mint.decimals;
      const totalSupply = new BigNumber(tokenData.mint.supply.basisPoints);
      const Mcap = await formatNumberToKOrM(Number(totalSupply.dividedBy(Math.pow(10, baseDecimals)).times(tokenPriceUSD)));
      const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;
      const startTime = ctx.session.dca_start_time == 0 ? 'Now' : new Date(ctx.session.dca_start_time);
      let  messageText =
      `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
      `Market Cap: <b>${Mcap} USD</b>\n` +
      `Price:  <b>${tokenPriceSOL.toFixed(9)} SOL</b> | <b>${(tokenPriceUSD).toFixed(9)} USD</b> \n\n` +
      `DCA Details:\n` +
      `Amount: <b>${ctx.session.dca_amount}</b> SOL\n` +
      `Cycles: <b>${ctx.session.dca_cycle_number}</b>\n` +
      `Start Time: <b>${startTime}</b>\n` +
      `Interval: <b>${ctx.session.dca_interval} Days</b>\n\n` +
      `Amount per cycle: <b>${(ctx.session.dca_amount_per_cycle).toFixed(4)}</b> SOL\n` +
      `Token Balance: <b>${shitBalance.userTokenBalance.toFixed(4)} $${userTokenSymbol} </b> | <b>${((shitBalance.userTokenBalance) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((shitBalance.userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n\n` +
      `Wallet balance: <b>${getSolBalanceData.toFixed(4)}</b> SOL | <b>${(getSolBalanceData * Number(solPrice)).toFixed(4)}</b> USD\n` ;
      let options: any;
  
  
      options = {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: " 🔂 Refresh ", callback_data: "refresh_dca_review" }, { text: " ⚙️ Settings ", callback_data: "settings" },],
            [{ text: "Submit DCA order", callback_data: "dca_submit" }],
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
  }catch(e){
    console.log(e);
  }
}