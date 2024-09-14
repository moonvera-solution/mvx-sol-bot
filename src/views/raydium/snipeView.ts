import { PublicKey } from '@solana/web3.js';
import { getTokenMetadata, getuserShitBalance, getUserTokenBalanceAndDetails } from '../../service/feeds';
import { getPoolToken_details, quoteToken } from './../util/dataCalculation';
import { formatNumberToKOrM, getSolBalance } from '../../service/util';
import { CONNECTION, SOL_ADDRESS } from '../../config';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { UserPositions } from '../../db';
import { getTokenDataFromBirdEye, getTokenDataFromBirdEyePositions } from '../../api/priceFeeds/birdEye';
import { getAmmV4PoolKeys } from '../../service/dex/raydium/utils/formatAmmKeysById';

export async function display_snipe_amm_options(ctx: any, isRefresh: boolean, msgTxt?: string) {
  try {
    let messageText;
    let priority_Level = ctx.session.priorityFees;
    const priority_custom = ctx.session.ispriorityCustomFee;
    if (priority_custom === true) {
      priority_Level = 0;
    }

    const connection = CONNECTION;
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
    // console.log("activePool",activePool)

    const { poolKeys, rpcData, poolInfo } = await getAmmV4PoolKeys(ctx);
    const baseMint = rpcData.baseMint;
    const currentTime = new Date();
    ctx.session.poolTime = Number(poolKeys.openTime);
    const poolStartTime = new Date(ctx.session.poolTime * 1000);
    // console.log('poolStartTime', poolStartTime);

    let poolStatusMessage;
    if (currentTime >= poolStartTime) {
      poolStatusMessage = "✅ Opened";
    } else {
      const timeDiff = Number(poolStartTime) - Number(currentTime);
      const countdown = new Date(timeDiff).toISOString().substr(11, 8);
      poolStatusMessage = `⏳ Opening in ${countdown}`;
    }
    // console.log("poolKeys", poolKeys);
    if (poolKeys && baseMint) {
      const [baseReserve, quoteReserve, status] = [
        rpcData.baseReserve,
        rpcData.quoteReserve,
        rpcData.status.toNumber(),
      ];
      const baseVault = rpcData.baseVault;
      const quoteVault = rpcData.quoteVault;
      const baseDecimals = Number(rpcData.baseDecimal);
      const quoteDecimals = Number(rpcData.quoteDecimal);
      const tokenAddress = new PublicKey(baseMint);

      const [
        birdeyeData,
        tokenMetadataResult,
        balanceInSOL,
        userTokenDetails,
        jupSolPrice,
        tokenInfo,
      ] = await Promise.all([
        getTokenDataFromBirdEye(tokenAddress.toString(), userPublicKey),
        getTokenMetadata(ctx, tokenAddress.toBase58()),
        getSolBalance(userPublicKey, connection),
        getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress, connection),
        fetch(
          `https://price.jup.ag/v6/price?ids=SOL`
        ).then((response) => response.json()),
        getPoolToken_details(baseVault, quoteVault, baseMint, connection),

      ]);
  


      const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.value : Number(jupSolPrice.data.SOL.price);

      const {
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
        tokenData,
      } = tokenMetadataResult;
      const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;

      const tokenPriceUSD = birdeyeData &&
      birdeyeData.response &&
      birdeyeData.response.data &&
      birdeyeData.response.data.price != null // This checks for both null and undefined
      ? birdeyeData.response.data.price
      : (Number(quoteReserve) / Number(baseReserve) / Math.pow(10, quoteDecimals - baseDecimals)) * solPrice;

      const baseSupply =
      birdeyeData &&
        birdeyeData.response &&
        birdeyeData.response.data &&
        birdeyeData.response.data.supply != null // This checks for both null and undefined
        ? birdeyeData.response.data.supply
        : Number(tokenInfo.baseTokenSupply.dividedBy(Math.pow(10, baseDecimals)));
        const mcap = baseSupply * tokenPriceUSD;
      const formattedmac = await formatNumberToKOrM(mcap) ?? "NA";

      ctx.session.currentMode = 'snipe';
      // showing the user the countdowm to the snipe
   

      const tokenPriceSOL = birdeyeData ? tokenPriceUSD / solPrice : Number(baseReserve) / Math.pow(10, quoteDecimals - baseDecimals);

      // const priceImpact = tokenInfo.priceImpact.toFixed(2);
      // const priceImpact_1 = tokenInfo.priceImpact_1.toFixed(2);


      const balanceInUSD = (balanceInSOL * (solPrice)).toFixed(2);
      // const priceImpactTxt = isCpmmPool ? '' : `price Impact (5.0 SOL) : <b>${priceImpact}%</b> \n\n`;
      messageText = `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
        `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
        `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
        `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
        `Market Cap: <b>${formattedmac} USD</b>\n` +
        `Token Price: <b> ${tokenPriceUSD.toFixed(9)} USD</b> | <b> ${tokenPriceSOL.toFixed(9)} SOL</b> \n` +
        // `💧 Liquidity: <b>${(formattedLiquidity)}</b>  USD\n` + 
        // priceImpactTxt +
        `Pool Status: <b>${poolStatusMessage}</b>\n\n` +
        // `--<code>Priority fees</code>--\n Low: ${(Number(mediumpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(highpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(maxpriorityFees) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
        `Token Balance: <b>${userTokenBalance.toFixed(3)} $${userTokenSymbol} </b> | <b>${((userTokenBalance) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
        `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n `;
    } else {
      ctx.session.snipeToken = ctx.session.snipeToken instanceof PublicKey ? ctx.session.snipeToken.toBase58() : ctx.session.snipeToken;
      const { tokenData } = await getTokenMetadata(ctx, ctx.session.snipeToken);
      messageText = `<b>${tokenData.name} (${tokenData.symbol})</b> | 📄 CA: <code>${msgTxt}</code> <a href="copy:${msgTxt}">🅲</a>\n` +
        `No pool available for this token yet. \nSet Sniper by selecting slippage and amount.`;
    }
    if (isRefresh) {
      await ctx.editMessageText(messageText, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: ' 🔂 Refresh ', callback_data: 'refresh_snipe' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
            [{ text: `⛷️ Set snipe slippage (${ctx.session.snipeSlippage}%) 🖋️`, callback_data: 'set_snipe_slippage' }],
            [{ text: '🎯 X SOL', callback_data: 'snipe_X_SOL' }, { text: '🎯 0.5 SOL', callback_data: 'snipe_0.5_SOL' }, { text: '🎯 1 SOL', callback_data: 'snipe_1_SOL' }],
            [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: `Set priority ${ctx.session.customPriorityFee}`, callback_data: 'set_customPriority' }],
            [{ text: 'Cancel', callback_data: 'closing' }]
          ]

        },
      });
    } else {
      await ctx.api.sendMessage(ctx.chat.id, messageText, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: ' 🔂 Refresh ', callback_data: 'refresh_snipe' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
            [{ text: `⛷️ Set snipe slippage (${ctx.session.snipeSlippage}%) 🖋️`, callback_data: 'set_snipe_slippage' }],
            [{ text: '🎯 X SOL', callback_data: 'snipe_X_SOL' }, { text: '🎯 0.5 SOL', callback_data: 'snipe_0.5_SOL' }, { text: '🎯 1 SOL', callback_data: 'snipe_1_SOL' }],
            [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: `Set priority ${ctx.session.customPriorityFee}`, callback_data: 'set_customPriority' }],
            [{ text: 'Cancel', callback_data: 'closing' }]
          ]

        },
      });
    }
  } catch (error: any) {
    console.log('display_snipe_options error:', error);
    // console.log("display_snipe_options", error);
  }
}

export async function display_snipe_cpmm_options(ctx: any, isRefresh: boolean, msgTxt?: string) {
  try {
    let messageText;
    let priority_Level = ctx.session.priorityFees;
    const priority_custom = ctx.session.ispriorityCustomFee;
    if (priority_custom === true) {
      priority_Level = 0;
    }

    const connection = CONNECTION;
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
    // console.log("activePool",activePool)
    // console.log('ctx.session.cpmmPoolInfo', ctx.session.cpmmPoolInfo);
    const tokenAddress = ctx.session.cpmmPoolInfo.mintA.address == SOL_ADDRESS ? new PublicKey(ctx.session.cpmmPoolInfo.mintB.address): new PublicKey(ctx.session.cpmmPoolInfo.mintA.address);

    const baseMint = tokenAddress;
    const currentTime = new Date();
    ctx.session.poolTime = Number(ctx.session.cpmmPoolInfo.openTime);
    const poolStartTime = new Date(ctx.session.poolTime * 1000);
    // console.log('poolStartTime', poolStartTime);

    let poolStatusMessage;
    if (currentTime >= poolStartTime) {
      poolStatusMessage = "✅ Opened";
    } else {
      const timeDiff = Number(poolStartTime) - Number(currentTime);
      const countdown = new Date(timeDiff).toISOString().substr(11, 8);
      poolStatusMessage = `⏳ Opening in ${countdown}`;
    }
    // console.log("poolKeys", poolKeys);
    if (ctx.session.cpmmPoolInfo.id && baseMint) {
    
     const baseVault = ctx.session.cpmmPoolInfo.mintA.address == SOL_ADDRESS ? ctx.session.cpmmPoolInfo.vault.A : ctx.session.cpmmPoolInfo.vault.B;
     const quoteVault = ctx.session.cpmmPoolInfo.mintA.address == SOL_ADDRESS ? ctx.session.cpmmPoolInfo.vault.B : ctx.session.cpmmPoolInfo.vault.A;
      const [
        shitBalance,
        birdeyeData,
        tokenMetadataResult,
        balanceInSOL,
        userPosition,
        userTokenDetails,
        jupSolPrice,
        tokenInfo,
    
      ] = await Promise.all([
        getuserShitBalance(userPublicKey, tokenAddress, connection),
        getTokenDataFromBirdEyePositions(tokenAddress.toString(), userPublicKey),
        getTokenMetadata(ctx, tokenAddress.toBase58()),
        getSolBalance(userPublicKey, connection),
        UserPositions.find({ walletId: userPublicKey }, { positions: { $slice: -7 } }),
        getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress, connection),
        fetch(
          `https://price.jup.ag/v6/price?ids=SOL`
        ).then((response) => response.json()),
        getPoolToken_details(quoteVault,baseVault, baseMint, connection),

      ]);
  
      const baseDecimals = ctx.session.cpmmPoolInfo.mintA.address == SOL_ADDRESS ? ctx.session.cpmmPoolInfo.mintB.decimals : ctx.session.cpmmPoolInfo.mintA.decimals;
      const quoteDecimals = ctx.session.cpmmPoolInfo.mintA.address == SOL_ADDRESS ? ctx.session.cpmmPoolInfo.mintA.decimals : ctx.session.cpmmPoolInfo.mintB.decimals;
  

      const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.value : Number(jupSolPrice.data.SOL.price);
      
      const priceCpmm = ((Number(tokenInfo.quoteTokenVaultSupply) ) / (Number(tokenInfo.baseTokenVaultSupply))) * solPrice;


      const {
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
        tokenData,
      } = tokenMetadataResult;
      const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;

      const tokenPriceUSD = birdeyeData
      && birdeyeData.response
      && birdeyeData.response.data
      && birdeyeData.response.data.price != null  // This checks for both null and undefined
      ? birdeyeData.response.data.price
      : (Number(tokenInfo.quoteTokenVaultSupply) / Number(tokenInfo.baseTokenVaultSupply)) * solPrice;
      // console.log('Number(tokenInfo.baseTokenSupply.dividedBy(Math.pow(10, baseDecimals)))', Number(tokenInfo.baseTokenSupply.dividedBy(Math.pow(10, baseDecimals))));
   
      const baseSupply = birdeyeData
      && birdeyeData.response
      && birdeyeData.response.data
      && birdeyeData.response.data.supply != null  // This checks for both null and undefined
      ? birdeyeData.response.data.supply
      : Number(tokenInfo.baseTokenSupply.dividedBy(Math.pow(10, baseDecimals)));
      const mcap = baseSupply * tokenPriceUSD;

      const formattedmac = await formatNumberToKOrM(mcap) ?? "NA";

      ctx.session.currentMode = 'snipe';
      // showing the user the countdowm to the snipe
   

      const tokenPriceSOL = birdeyeData ? (tokenPriceUSD / solPrice) : Number(priceCpmm);




      const balanceInUSD = (balanceInSOL * (solPrice)).toFixed(2);
      // const priceImpactTxt = isCpmmPool ? '' : `price Impact (5.0 SOL) : <b>${priceImpact}%</b> \n\n`;
      messageText = `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
        `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
        `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
        `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
        `Market Cap: <b>${formattedmac} USD</b>\n` +
        `Token Price: <b> ${tokenPriceUSD.toFixed(9)} USD</b> | <b> ${tokenPriceSOL.toFixed(9)} SOL</b> \n` +
        // `💧 Liquidity: <b>${(formattedLiquidity)}</b>  USD\n` + 
        // priceImpactTxt +
        `Pool Status: <b>${poolStatusMessage}</b>\n\n` +
        // `--<code>Priority fees</code>--\n Low: ${(Number(mediumpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(highpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(maxpriorityFees) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
        `Token Balance: <b>${shitBalance.userTokenBalance.toFixed(3)} $${userTokenSymbol} </b> | <b>${((shitBalance.userTokenBalance) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((shitBalance.userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
        `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n `;
    } else {
      ctx.session.snipeToken = ctx.session.snipeToken instanceof PublicKey ? ctx.session.snipeToken.toBase58() : ctx.session.snipeToken;
      const { tokenData } = await getTokenMetadata(ctx, ctx.session.snipeToken);
      messageText = `<b>${tokenData.name} (${tokenData.symbol})</b> | 📄 CA: <code>${msgTxt}</code> <a href="copy:${msgTxt}">🅲</a>\n` +
        `No pool available for this token yet. \nSet Sniper by selecting slippage and amount.`;
    }
    if (isRefresh) {
      await ctx.editMessageText(messageText, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: ' 🔂 Refresh ', callback_data: 'refresh_snipe' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
            [{ text: `⛷️ Set snipe slippage (${ctx.session.snipeSlippage}%) 🖋️`, callback_data: 'set_snipe_slippage' }],
            [{ text: '🎯 X SOL', callback_data: 'snipe_X_SOL' }, { text: '🎯 0.5 SOL', callback_data: 'snipe_0.5_SOL' }, { text: '🎯 1 SOL', callback_data: 'snipe_1_SOL' }],
            [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: `Set priority ${ctx.session.customPriorityFee}`, callback_data: 'set_customPriority' }],
            [{ text: 'Cancel', callback_data: 'closing' }]
          ]

        },
      });
    } else {
      await ctx.api.sendMessage(ctx.chat.id, messageText, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: ' 🔂 Refresh ', callback_data: 'refresh_snipe' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
            [{ text: `⛷️ Set snipe slippage (${ctx.session.snipeSlippage}%) 🖋️`, callback_data: 'set_snipe_slippage' }],
            [{ text: '🎯 X SOL', callback_data: 'snipe_X_SOL' }, { text: '🎯 0.5 SOL', callback_data: 'snipe_0.5_SOL' }, { text: '🎯 1 SOL', callback_data: 'snipe_1_SOL' }],
            [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: `Set priority ${ctx.session.customPriorityFee}`, callback_data: 'set_customPriority' }],
            [{ text: 'Cancel', callback_data: 'closing' }]
          ]

        },
      });
    }
  } catch (error: any) {
    console.log('display_snipe_options error:', error);
    // console.log("display_snipe_options", error);
  }
}
