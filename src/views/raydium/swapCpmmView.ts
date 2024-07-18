import { getpoolDataCpmm, getRayCpmmPoolKeys, raydium_cpmm_swap } from "../../service/dex/raydium/cpmm/index";
import { PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getuserShitBalance, getUserTokenBalanceAndDetails } from '../../service/feeds';
import dotenv from "dotenv"; dotenv.config();
import { formatNumberToKOrM, getSolBalance, getSwapAmountOutCpmm, getSwapAmountOutPump, updatePositions } from '../../service/util';
import { Keypair, Connection } from '@solana/web3.js';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { getTokenDataFromBirdEyePositions } from '../../api/priceFeeds/birdEye';
import { UserPositions } from '../../db/mongo/schema';
import { MVXBOT_FEES, SOL_ADDRESS } from '../../config';
import bs58 from "bs58";
import BigNumber from 'bignumber.js';
import { saveUserPosition } from '../../service/portfolio/positions';

export async function ray_cpmm_swap(ctx: any) {
  const chatId = ctx.chat.id;
  const TRITON_RPC_URL='https://moonvera-ams.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41'
  const connection = new Connection(TRITON_RPC_URL);
  // const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
  const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
  const payerKeypair = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[activeWalletIndexIdx].secretKey));
  const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
  const isBuySide = ctx.session.cpmm_side == "buy";
  const tokenIn = isBuySide ? SOL_ADDRESS : ctx.session.jupSwap_token;
  const tokenOut = isBuySide ? ctx.session.jupSwap_token : SOL_ADDRESS;
  const userTokenBalanceAndDetails = isBuySide ? await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenOut), connection) : await getUserTokenBalanceAndDetails(new PublicKey(userWallet.publicKey), new PublicKey(tokenIn), connection);
  console.log('userTokenBalanceAndDetails', userTokenBalanceAndDetails.userTokenBalance);
  console.log('userTokenBalanceAndDetails', userTokenBalanceAndDetails.decimals);
  const amountToSell = Math.floor((ctx.session.cpmm_amountIn / 100) * userTokenBalanceAndDetails.userTokenBalance * Math.pow(10, userTokenBalanceAndDetails.decimals));
  console.log('amountToSell', amountToSell);
  const amountIn = isBuySide ? ctx.session.cpmm_amountIn * 1e9 : amountToSell;
  // const refObject = { referralWallet: ctx.session.referralWallet, referralCommision: ctx.session.referralCommision };
  const userSolBalance = (await getSolBalance(userWallet.publicKey, connection) * 1e9);

  const minBalance = (amountIn + (amountIn * MVXBOT_FEES.toNumber()) + (ctx.session.customPriorityFee * 1e9));
  if (isBuySide && minBalance > userSolBalance) {
    await ctx.api.sendMessage(chatId, `❌ You do not have enough SOL to buy ${userTokenBalanceAndDetails.userTokenSymbol}.`, { parse_mode: 'HTML', disable_web_page_preview: true });
    return;
  }
  if (!isBuySide && amountToSell <= 0) {
    await ctx.api.sendMessage(chatId, `❌ You do not have enough ${userTokenBalanceAndDetails.userTokenSymbol} to sell.`, { parse_mode: 'HTML', disable_web_page_preview: true });
    return;
  }

  await ctx.api.sendMessage(chatId, `🟢 <b>Transaction ${ctx.session.cpmm_side.toUpperCase()}:</b> Processing... \n Please wait for confirmation.`, { parse_mode: 'HTML', disable_web_page_preview: true });
  console.log('slippage', ctx.session.latestSlippage);
  raydium_cpmm_swap(
    connection,
    payerKeypair,
    ctx.session.cpmm_side,
    ctx.session.cpmmPoolId,
    amountIn,
    (ctx.session.latestSlippage / 100),
    { refWallet: ctx.session.referralWallet, referral: true, refCommission: ctx.session.referralCommision },
    ctx
  ).then(async (txid) => {
    if (!txid) return;
    const tradeType = isBuySide ? 'buy' : 'sell';
    if (txid) {

      const config = {
        searchTransactionHistory: true
      };
      const sigStatus = await connection.getSignatureStatus(txid, config)
      if (sigStatus?.value?.err) {
        await ctx.api.sendMessage(chatId, `❌ ${tradeType.toUpperCase()} tx failed. Please try again later.`, { parse_mode: 'HTML', disable_web_page_preview: true });
        return;
      }
      let tokenAmount, confirmedMsg;
      let solFromSell = 0;
      const _symbol = userTokenBalanceAndDetails.userTokenSymbol;
      let extractAmount = await getSwapAmountOutCpmm(connection, txid, tradeType)
      const amountFormatted = Number(extractAmount / Math.pow(10, userTokenBalanceAndDetails.decimals)).toFixed(4);
      tradeType == 'buy' ? tokenAmount = extractAmount : solFromSell = extractAmount;
      confirmedMsg = `✅ <b>${tradeType.toUpperCase()} tx confirmed</b> ${tradeType == 'buy' ? `You bought <b>${amountFormatted}</b> <b>${_symbol}</b> for <b>${amountIn / 1e9} SOL</b>` : `You sold <b>${amountToSell / Math.pow(10, userTokenBalanceAndDetails.decimals)}</b> <b>${_symbol}</b> and received <b>${(ctx.session.CpmmSolExtracted / 1e9).toFixed(4)} SOL</b>`}. <a href="https://solscan.io/tx/${txid}">View Details</a>.`;
      const userPosition = await UserPositions.findOne({ positionChatId: chatId, walletId: userWallet.publicKey.toString() });
      let oldPositionSol: number = 0;
      let oldPositionToken: number = 0;
      if (userPosition) {
        const existingPositionIndex = userPosition.positions.findIndex(
          position => position.baseMint === (isBuySide ? tokenOut.toString() : tokenIn.toString())
        );
        // console.log('existingPositionIndex', existingPositionIndex);
        if (userPosition.positions[existingPositionIndex]) {
          oldPositionSol = userPosition.positions[existingPositionIndex].amountIn
          oldPositionToken = userPosition.positions[existingPositionIndex].amountOut!
        }
      }
      if (tradeType == 'buy') {
        saveUserPosition(chatId,
          userWallet.publicKey.toString(), {
          baseMint: tokenOut,
          name: userTokenBalanceAndDetails.userTokenName,
          symbol: _symbol,
          tradeType: `cpmm_swap`,
          amountIn: oldPositionSol ? oldPositionSol + (ctx.session.cpmm_amountIn * 1e9) : (ctx.session.cpmm_amountIn * 1e9),
          amountOut: oldPositionToken ? oldPositionToken + Number(extractAmount) : Number(extractAmount),

        });
      } else if (tradeType == 'sell') {
        let newAmountIn, newAmountOut;

        if (Number(amountIn) === oldPositionToken || oldPositionSol <= extractAmount) {
          newAmountIn = 0;
          newAmountOut = 0;
        } else {
          newAmountIn = oldPositionSol > 0 ? oldPositionSol - extractAmount : oldPositionSol;
          newAmountOut = oldPositionToken > 0 ? oldPositionToken - Number(amountIn) : oldPositionToken;
        }
        if (newAmountIn <= 0 || newAmountOut <= 0) {
          await UserPositions.updateOne({ walletId: userWallet.publicKey.toString() }, { $pull: { positions: { baseMint: tokenIn } } });
          ctx.session.positionIndex = 0;
        } else {
          saveUserPosition(chatId,
            userWallet.publicKey.toString(), {
            baseMint: tokenIn,
            name: userTokenBalanceAndDetails.userTokenName,
            symbol: _symbol,
            tradeType: `cpmm_swap`,
            amountIn: newAmountIn,
            amountOut: newAmountOut,
          });
        }
        ctx.session.latestCommand = 'jupiter_swap'
      }
      await ctx.api.sendMessage(chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
      if (tradeType == 'buy') {
        ctx.session.latestCommand = 'jupiter_swap';
        await display_cpmm_raydium_details(ctx, false);
      }
    } else {
      await ctx.api.sendMessage(chatId, `❌ ${tradeType.toUpperCase()} tx failed. Please try again later.`, { parse_mode: 'HTML', disable_web_page_preview: true });
    }
  }).catch(async (error: any) => {
    await ctx.api.sendMessage(chatId, error.message, { parse_mode: 'HTML', disable_web_page_preview: true });
  });
}

export async function display_cpmm_raydium_details(ctx: any, isRefresh: boolean) {
  console.log('we are on cpmm raydium details')

  let priority_Level = ctx.session.priorityFees;
  const priority_custom = ctx.session.ispriorityCustomFee;
  if (priority_custom === true) {
    priority_Level = 0;
  }
  const connection = new Connection(`${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`);
  const cpmmPoolKey = ctx.session.cpmmPoolId;
  console.log('cpmmPoolKey', cpmmPoolKey);
  if (!cpmmPoolKey) {
    return undefined;
  }
  // console.log('ctx.session.cpmmPoolInfo', ctx.session.cpmmPoolInfo);
  const chatId = ctx.chat.id;
  const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
  const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
  const payerKeypair = Keypair.fromSecretKey(bs58.decode(ctx.session.portfolio.wallets[activeWalletIndexIdx].secretKey));
  // console.log("cpmmPoolKey-%c>", cpmmPoolKey);
  ctx.session.cpmmPoolInfo = await getpoolDataCpmm(payerKeypair, cpmmPoolKey, connection);

  const tokenAddress = new PublicKey(ctx.session.cpmmPoolInfo.mintB.address);
  const [
    shitBalance,
    birdeyeData,
    tokenMetadataResult,
    balanceInSOL,
    userPosition,
    userTokenDetails,
    jupSolPrice

  ] = await Promise.all([
    getuserShitBalance(userPublicKey,tokenAddress, connection),
    getTokenDataFromBirdEyePositions(tokenAddress.toString(), userPublicKey),
    getTokenMetadata(ctx, tokenAddress.toBase58()),
    getSolBalance(userPublicKey, connection),
    UserPositions.find({ positionChatId: chatId, walletId: userPublicKey }, { positions: { $slice: -7 } }),
    getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress, connection),
    fetch(
      `https://price.jup.ag/v6/price?ids=SOL`
    ).then((response) => response.json()),
  ]);

  const cpmmSupply = new BigNumber(tokenMetadataResult.tokenData.mint.supply.basisPoints)

  const priceCpmm = ctx.session.cpmmPoolInfo.mintAmountA / ctx.session.cpmmPoolInfo.mintAmountB;

  const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.value : Number(jupSolPrice.data.SOL.price);
  // console.log('cpmmPrice', priceCpmm * solPrice);

  const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;
  const tokenSupply = Number(cpmmSupply) / decimals
  const tokenPriceUSD = birdeyeData
    && birdeyeData.response
    && birdeyeData.response.data
    && birdeyeData.response.data.price != null  // This checks for both null and undefined
    ? birdeyeData.response.data.price
    : priceCpmm * solPrice;

  // console.log('tokenPriceUSD', tokenPriceUSD);
  const tokenPriceSOL = birdeyeData ? (tokenPriceUSD / solPrice) : Number(priceCpmm);

  let specificPosition;
  if (userPosition[0] && userPosition[0].positions && userPosition[0].positions != undefined) {
    specificPosition = userPosition[0].positions.find((pos: any) => new PublicKey(pos.baseMint).equals(tokenAddress));

  }
  let initialInUSD = 0;
  let initialInSOL = 0;
  let valueInUSD: any;
  let valueInSOL: any;
  let profitPercentage;
  let profitInUSD;
  let profitInSol;
  if (specificPosition && specificPosition.amountOut) {
    valueInUSD = (specificPosition.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, decimals))) < 5 ? userTokenDetails.userTokenBalance * Number(tokenPriceUSD) : 'N/A';
    valueInSOL = (specificPosition.amountOut - (userTokenDetails.userTokenBalance * Math.pow(10, decimals))) < 5 ? Number(((userTokenDetails.userTokenBalance)) * Number(tokenPriceSOL)) : 'N/A';
    initialInSOL = Number(specificPosition.amountIn) / 1e9;
    initialInUSD = initialInSOL * Number(solPrice);
    profitPercentage = valueInSOL != 'N/A' ? (Number(valueInSOL) - (Number(specificPosition.amountIn) / 1e9)) / (Number(specificPosition.amountIn) / 1e9) * 100 : 'N/A';
    profitInUSD = valueInUSD != 'N/A' ? Number(Number(userTokenDetails.userTokenBalance) * Number(tokenPriceUSD)) - initialInUSD : 'N/A';
    profitInSol = valueInSOL != 'N/A' ? (valueInSOL - initialInSOL).toFixed(4) : 'N/A';
  }

  const {
    birdeyeURL,
    dextoolsURL,
    dexscreenerURL,
    tokenData,
  } = tokenMetadataResult;
  const baseSupply = birdeyeData
    && birdeyeData.response
    && birdeyeData.response.data
    && birdeyeData.response.data.supply != null  // This checks for both null and undefined
    ? birdeyeData.response.data.supply
    : tokenSupply;
  const mcap = baseSupply * tokenPriceUSD;
  const netWorth = birdeyeData
    && birdeyeData.birdeyePosition
    && birdeyeData.birdeyePosition.data
    && birdeyeData.birdeyePosition.data.totalUsd
    ? birdeyeData.birdeyePosition.data.totalUsd : NaN;

  const netWorthSol = netWorth / solPrice;
  try {

    const formattedmac = await formatNumberToKOrM(mcap) ?? "NA";

    // const priceImpact = tokenInfo.priceImpact.toFixed(2);
    const balanceInUSD = (balanceInSOL * (solPrice)).toFixed(2);
    // Construct the message
    let options: any;
    let messageText: any;


    messageText = `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
      `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
      `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
      `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
      `Market Cap: <b>${formattedmac} USD</b>\n` +
      `Token Price: <b> ${tokenPriceUSD.toFixed(9)} USD</b> | <b> ${tokenPriceSOL.toFixed(9)} SOL</b> \n\n` +
      `---<code>Trade Position</code>---\n` +
      `Initial : <b>${(initialInSOL).toFixed(4)} SOL</b> | <b>${(initialInUSD.toFixed(4))} USD</b>\n` +
      `Profit: ${profitInSol != 'N/A' ? Number(profitInSol).toFixed(4) : 'N/A'} <b>SOL</b> | ${profitInUSD != 'N/A' ? Number(profitInUSD).toFixed(4) : 'N/A'} <b>USD</b> | ${profitPercentage != 'N/A' ? Number(profitPercentage).toFixed(2) : 'N/A'}%\n` +
      `Token Balance: <b>${shitBalance.userTokenBalance.toFixed(4)} $${userTokenSymbol} </b> | <b>${((shitBalance.userTokenBalance) * Number(tokenPriceUSD)).toFixed(3)} USD </b>| <b>${((shitBalance.userTokenBalance) * Number(tokenPriceSOL)).toFixed(4)} SOL </b> \n` +
      // `Price Impact (5.0 SOL) : <b>${priceImpact}%</b> \n\n` +
      // `--<code>Priority fees</code>--\n Low: ${(Number(mediumpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(highpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(maxpriorityFees) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
      `Wallet Balance: <b>${balanceInSOL.toFixed(3)} SOL</b> | <b>${balanceInUSD} USD</b>\n ` +
      `Net Worth: <b>${netWorthSol.toFixed(4)}</b> SOL | <b>${netWorth.toFixed(4)}</b> USD\n`;

    // Define buy mode inline keyboard
    options = {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: ' 🔂 Refresh ', callback_data: 'refresh_cpmm_trade' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
          [{ text: 'Buy (X SOL)', callback_data: 'buy_X_CPMM' }, { text: 'Buy (0.5 SOL)', callback_data: 'buy_0.5_CPMM' }, { text: 'Buy (1 SOL)', callback_data: 'buy_1_CPMM' }],
          [{ text: `Sell X %`, callback_data: 'sell_X_CPMM' }, { text: 'Sell 50%  ', callback_data: 'sell_50_CPMM' }, { text: 'Sell 100%  ', callback_data: 'sell_100_CPMM' }],

          [{ text: `⛷️ Set Slippage (${ctx.session.latestSlippage}%) 🖋️`, callback_data: 'set_slippage' }, { text: `Set priority ${ctx.session.customPriorityFee}`, callback_data: 'set_customPriority' }],
          [{ text: 'Cancel', callback_data: 'closing' }]
        ]
      },
    };


    if (isRefresh) {
      await ctx.editMessageText(messageText, options);
    } else {
      await ctx.api.sendMessage(chatId, messageText, options);
    }
  } catch (error: any) {
    console.error('Error in display_token_details:', error);
    console.error('Error in getTokenMetadata:', error.message);
  }

}       