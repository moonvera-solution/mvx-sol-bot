
import { PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getUserTokenBalanceAndDetails } from '../../service/feeds';
import { quoteToken } from '../util/dataCalculation';
import { getSolanaDetails } from '../..//api';
import { formatNumberToKOrM, getSolBalance } from '../../service/util';
import { RAYDIUM_POOL_TYPE } from '../../service/util/types';
import { Keypair, Connection } from '@solana/web3.js';
import { runAllFees } from '../util/getPriority';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { logErrorToFile } from "../../../error/logger";
import { UserPositions } from '../../db';
import { getTokenDataFromBirdEye } from '../../api/priceFeeds/birdEye';
import { SOL_ADDRESS } from "../../../config";
import {jupiterSimpleSwap} from '../../service/dex/jupiter/trade/swaps';
import bs58 from 'bs58';


export async function jupiterSwap(ctx:any){
    const chatId = ctx.chat.id;
    const wallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
    const userWallet: Keypair = Keypair.fromSecretKey(bs58.decode(String(wallet.secretKey)));
    const amountIn = ctx.session.jupSwap.amount;
    const tradeSide = ctx.session.jupSwap.side == "buy";
    const tokenIn = tradeSide ? SOL_ADDRESS : ctx.session.jupSwap.token;
    const tokenOut = tradeSide ? ctx.session.jupSwap.token : SOL_ADDRESS;
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
    const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`
    const refObject = { referralWallet: ctx.session.referralWallet, referralCommision: ctx.referralCommision};
    jupiterSimpleSwap(
        connection,
        rpcUrl,
        userWallet,
        tradeSide,
        tokenIn,
        tokenOut,
        amountIn,
        ctx.session.slippage,
        ctx.session.priorityFees,
        refObject
      ).then(async(txSig) => {
        console.log('txSigs:', txSig)
        // let msg = `🟢 <b>Transaction ${tradeSide.toUpperCase()}:</b> Processing ... <a href="https://solscan.io/tx/${txSig}">View on Solscan</a>. Please wait for confirmation...`

        // if(txSig){

        //     ctx.api.sendMessage(chatId, `Swap successful, tx: ${txSig}`, { parse_mode: 'HTML' });
        // }else{
        //     ctx.api.sendMessage(chatId, "Swap failed, please try again", { parse_mode: 'HTML' });
        // }
      });
}


export async function display_snipe_options(ctx: any, isRefresh: boolean, msgTxt?: string) {
  try {
    let messageText;
    let priority_Level = ctx.session.priorityFees;
    const priority_custom = ctx.session.ispriorityCustomFee;
    if(priority_custom === true){
      priority_Level = 0;
    }
    let raydiumId = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
    const activePool = ctx.session.activeTradingPool;
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
    // console.log("activePool",activePool)
    if (!msgTxt && !activePool) { await ctx.api.sendMessage(ctx.chat.id, "Enter token address to snipe.", { parse_mode: 'HTML' }); return; }

    if (activePool && activePool.baseMint != DEFAULT_PUBLIC_KEY) {

      const rayPoolKeys: RAYDIUM_POOL_TYPE = ctx.session.activeTradingPool;

      const baseVault = rayPoolKeys.baseVault;
      const quoteVault = rayPoolKeys.quoteVault;
      const baseDecimals = rayPoolKeys.baseDecimals;
      const quoteDecimals = rayPoolKeys.quoteDecimals;
      const baseMint = rayPoolKeys.baseMint;
      const chatId = ctx.chat.id;
      const tokenAddress = new PublicKey(ctx.session.snipeToken);

      const [
        birdeyeData,
        tokenMetadataResult,
        // solPrice,
        tokenInfo,
        balanceInSOL,
        userTokenDetails,
        AllpriorityFees,

      ] = await Promise.all([
        getTokenDataFromBirdEye(tokenAddress.toString()),
        getTokenMetadata(ctx, tokenAddress.toBase58()),
        // getSolanaDetails(),
        quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint, connection }),
        getSolBalance(userPublicKey, connection),
        getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress, connection),
        runAllFees(ctx, raydiumId),

      ]);
      const mediumpriorityFees = (AllpriorityFees.result2);
      const highpriorityFees = (AllpriorityFees.result3);
      const maxpriorityFees = (AllpriorityFees.result4);
      const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.data.value : 0;


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
      && birdeyeData.response.data.data
      && birdeyeData.response.data.data.price != null  // This checks for both null and undefined
      ? birdeyeData.response.data.data.price
      : tokenInfo.price.times(solPrice).toNumber();

      const baseSupply = birdeyeData
  && birdeyeData.response
  && birdeyeData.response.data
  && birdeyeData.response.data.data
  && birdeyeData.response.data.data.supply != null  // This checks for both null and undefined
  ? birdeyeData.response.data.data.supply
  : Number(tokenInfo.baseTokenSupply.dividedBy(Math.pow(10, baseDecimals)));
  const mcap = baseSupply * tokenPriceUSD;  
  const formattedmac = await formatNumberToKOrM(mcap) ?? "NA";

      ctx.session.currentMode = 'snipe';
      // showing the user the countdowm to the snipe
      const currentTime = new Date();
      const poolStartTime = new Date(ctx.session.poolTime * 1000);

      let poolStatusMessage;
      if (currentTime >= poolStartTime) {
        poolStatusMessage = "✅ Opened";
      } else {
        const timeDiff = Number(poolStartTime) - Number(currentTime);
        const countdown = new Date(timeDiff).toISOString().substr(11, 8);
        poolStatusMessage = `⏳ Opening in ${countdown}`;
      }
      console.log('(tokenInfo.price.times(solPrice)', (tokenInfo.price.times(solPrice).toNumber()));
     
      const tokenPriceSOL = birdeyeData ? (tokenPriceUSD / solPrice) : tokenInfo.price.toNumber();

      const priceImpact = tokenInfo.priceImpact.toFixed(2);
      const priceImpact_1 = tokenInfo.priceImpact_1.toFixed(2);


      const balanceInUSD = (balanceInSOL * (solPrice)).toFixed(2);

      messageText = `<b>${tokenMetadataResult.tokenData.name} (${tokenMetadataResult.tokenData.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
        `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
        `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
        `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
        `Market Cap: <b>${formattedmac} USD</b>\n` +
        `Token Price: <b> ${tokenPriceUSD.toFixed(9)} USD</b> | <b> ${tokenPriceSOL.toFixed(9)} SOL</b> \n\n` +
        // `💧 Liquidity: <b>${(formattedLiquidity)}</b>  USD\n` + 
        `price Impact (5.0 SOL) : <b>${priceImpact}%</b> | (1.0 SOL): <b>${priceImpact_1}%</b> \n\n` +
        `Pool Status: <b>${poolStatusMessage}</b>\n\n` +
        `--<code>Priority fees</code>--\n Low: ${(Number(mediumpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n Medium: ${(Number(highpriorityFees) / 1e9).toFixed(7)} <b>SOL</b>\n High: ${(Number(maxpriorityFees) / 1e9).toFixed(7)} <b>SOL</b> \n\n` +
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
            [{ text: '📈 Priority fees', callback_data: '_' }],
            [
              { text: `Low ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_low' },
              { text: `Medium ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_medium' }, { text: `High ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_high' },{ text: `Custom ${priority_custom === true ? '✅' : ''}`, callback_data: 'priority_custom' }],
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
            [{ text: '📈 Priority fees', callback_data: '_' }],
            [
              { text: `Low ${priority_Level === 5000 ? '✅' : ''}`, callback_data: 'priority_low' },
              { text: `Medium ${priority_Level === 7500 ? '✅' : ''}`, callback_data: 'priority_medium' }, { text: `High ${priority_Level === 10000 ? '✅' : ''}`, callback_data: 'priority_high' },{ text: `Custom ${priority_custom === true ? '✅' : ''}`, callback_data: 'priority_custom' }],
            [{ text: 'Cancel', callback_data: 'closing' }]
          ]

        },
      });
    }
  } catch (error: any) {
    console.log('display_snipe_options:', error);
    logErrorToFile("display_snipe_options", error);
  }
}