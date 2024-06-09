import { PublicKey } from '@metaplex-foundation/js';
import { getLiquityFromOwner, getTokenMetadata } from '../../service/feeds';
import { quoteToken } from '../util/dataCalculation';
import { formatNumberToKOrM } from '../../service/util';
import { Connection } from '@solana/web3.js';
import { getTokenDataFromBirdEye } from '../../api/priceFeeds/birdEye';
import BigNumber from 'bignumber.js';


export async function display_rugCheck(ctx: any, isRefresh: boolean) {
  try {
    const chatId = ctx.chat.id;
    const session = ctx.session;
    const token = session.rugCheckToken instanceof PublicKey ? session.rugCheckToken.toBase58() : session.rugCheckToken;
    const rugPool = session.activeTradingPool;
    if (rugPool) {
      const baseVault = rugPool.baseVault;
      const quoteVault = rugPool.quoteVault;
      const baseDecimals = rugPool.baseDecimals;
      const quoteDecimals = rugPool.quoteDecimals;
      const baseMint = rugPool.baseMint;
      ctx.session.snipeToken = baseMint;
      ctx.session.buyToken = baseMint;
      const lpMint = rugPool.lpMint;
      const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
      const birdeyeURL = `https://birdeye.so/token/${token}?chain=solana`;
      const dextoolsURL = `https://www.dextools.io/app/solana/pair-explorer/${token}`;
      const dexscreenerURL = `https://dexscreener.com/solana/${token}`;

      const [
        birdeyeData,
        tokenMetadataResult,
        tokenInfo,
        parsedAccounts,
        jupSolPrice
      ] = await Promise.all([
        getTokenDataFromBirdEye(token, ''),
        getTokenMetadata(ctx, token),
        quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply: baseMint, connection }),
        connection.getMultipleParsedAccounts([
          new PublicKey(quoteVault),
          new PublicKey(baseMint),
          new PublicKey(baseVault),
          new PublicKey(lpMint)
        ], { commitment: 'processed' }),
        fetch(
          `https://price.jup.ag/v6/price?ids=SOL`
        ).then((response) => response.json()),
      ]);
      const quoteVaultInfo = parsedAccounts.value[0];
      const baseMintInfo = parsedAccounts.value[1];
      const baseVaultInfo = parsedAccounts.value[2];
      const lpMintInfo = parsedAccounts.value[3];

      const {
        tokenData,
      } = tokenMetadataResult;
      const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.value : Number(jupSolPrice.data.SOL.price);
      const tokenPriceSOL = birdeyeData ? new BigNumber(birdeyeData.response.data.price).div(solPrice) : new BigNumber(tokenInfo.price);
      const tokenPriceUSD = birdeyeData ? new BigNumber(birdeyeData.response.data.price) : new BigNumber(tokenInfo.price.times(solPrice));
      const processData = (...dataArgs: any[]) => {
        return dataArgs.map(data => {
          if (data?.data instanceof Buffer) {
            return null;
          }
          return data?.data.parsed.info;
        });
      };
      
      const [getPooledSol, getBaseSupply, circulatingSupply, aMM] = processData(quoteVaultInfo, baseMintInfo, baseVaultInfo, lpMintInfo);
      const creatorAddress = birdeyeData && birdeyeData.response2.data.creatorAddress!= null ? birdeyeData.response2.data.creatorAddress : tokenData.updateAuthorityAddress.toBase58();
      const circulatedSupply = Number(((Number(circulatingSupply.tokenAmount.amount)) / Math.pow(10, baseDecimals)));
      const baseTokenSupply = Number(((Number(getBaseSupply.supply)) / Math.pow(10, baseDecimals)));
      const mcap = baseTokenSupply * tokenPriceUSD.toNumber();
      //Get the user balance
      let [getCreatorPercentage, lpSupplyOwner, formattedCirculatingSupply, formattedSupply, formattedLiquidity, formattedmac] = await Promise.all([
        getLiquityFromOwner(new PublicKey(creatorAddress), new PublicKey(baseMint), connection),
        getLiquityFromOwner(new PublicKey(creatorAddress), new PublicKey(lpMint), connection),
        formatNumberToKOrM(Number(circulatedSupply)),
        formatNumberToKOrM(Number(baseTokenSupply)),
        formatNumberToKOrM((tokenInfo.liquidity * solPrice) / 0.5),
        formatNumberToKOrM(mcap)
      ]);
      const MutableInfo = birdeyeData?.response2.data.mutableMetadata ? '⚠️ Mutable' : '✅ Immutable';
      const renounced = tokenData.mint.mintAuthorityAddress?.toString() !== tokenData.updateAuthorityAddress.toString() ? "✅" : "❌ No";
      const top10 = Number(birdeyeData?.response2.data.top10HolderPercent) * 100;
      const freezable = birdeyeData?.response2.data.freezeable ? "⚠️ Be careful: This token is freezable." : "✅ Not freezable.";
      formattedmac = formattedmac ? formattedmac : "NA";
      formattedLiquidity = formattedLiquidity ? formattedLiquidity : "N/A";
      const circulatingPercentage = (Number(circulatedSupply) / Number(baseTokenSupply) * 100);
      const pooledSol = Number(((Number(getPooledSol.tokenAmount.amount)) / Math.pow(10, quoteDecimals)));
      // const isRaydium = aMM.mintAuthority === '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1' ? "<b>Raydium</b>" : "Unknown";
      const lpSupply = lpSupplyOwner.userTokenBalance;
      const islpBurnt = lpSupply > 0 ? "❌ No" : "✅ Yes";
      const creatorPercentage = (Number(getCreatorPercentage.userTokenBalance) / Number(baseTokenSupply) * 100);
      let liquidityWarning = (tokenInfo.liquidity * solPrice) / 0.5 < 300 ? "🟥 Be careful: This has low liquidity on Raydium." : "";

      let messageText = `<b>------ ${birdeyeData?.response.data.name} (${birdeyeData?.response.data.symbol}) ------</b>\n` +
        `Contract: <code>${token}</code>\n\n` +
        `<b>Links:</b>\n` +
        `👁️ <a href="${birdeyeURL}">Birdeye View</a> | ` +
        `🛠 <a href="${dextoolsURL}">Dextools Analysis</a> | ` +
        `🔍 <a href="${dexscreenerURL}">Dexscreener</a>\n\n` +
        `<b>------ Details ------</b>\n` +
        `Creator: <code>${creatorAddress}</code>\n` +
        `Mutable Info: ${MutableInfo}\n` +
        `Renounced: ${renounced}\n` +
        `Freezable: ${freezable}\n\n` +
        `<code>------Holders info------</code>\n` +
        `Creator's percentage: <b>${creatorPercentage}%</b>\n` +
        `Holders: <b>${birdeyeData?.response.data.holder}</b>\n` +
        `Top 10 Holders percentage: <b>${top10.toFixed(2)}%</b>\n\n` +
        `<code>------Financials------</code>\n` +
        `Total Supply: <b>${formattedSupply}</b> ${tokenData.symbol}\n` +
        `Circulating Supply: <b>${formattedCirculatingSupply}</b> ${tokenData.symbol} | <b>${circulatingPercentage.toFixed(2)}%</b>\n` +

        `Price: <b>${tokenPriceUSD.toFixed(9)} USD</b> | <b>${tokenPriceSOL.toFixed(9)} SOL</b>\n` +
        `Market Cap: <b>${formattedmac}</b> USD\n` +
        `Liquidity: <b>${formattedLiquidity}</b> USD\n` +
        `Pooled SOL: <b>${pooledSol.toFixed(3)}</b> SOL\n` +
        `LP Burnt: ${islpBurnt}\n\n` +
        `${liquidityWarning}`;

      let options: any;
      options = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: ' 🔂 Refresh ', callback_data: 'refrech_rug_check' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
            [{ text: `🎯 Snipe  ${tokenMetadataResult.tokenData.symbol}`, callback_data: 'snipe' }, { text: `💱 Buy  ${tokenMetadataResult.tokenData.symbol}`, callback_data: 'jupiter_swap' }],
            [{ text: 'Close', callback_data: 'closing' }]
          ]
        }
      };
      if (isRefresh) {
        await ctx.editMessageText(messageText, options);
      } else {
        await ctx.api.sendMessage(chatId, messageText, options);
      }
    }  else{
      ctx.api.sendMessage(chatId, "Token not found. Please try again.");
    }

  } catch (e) {
    console.log(e);
  }
}