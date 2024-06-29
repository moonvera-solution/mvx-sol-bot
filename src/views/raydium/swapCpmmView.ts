import {getpoolDataCpmm, getRayCpmmPoolKeys} from "../../service/dex/raydium/cpmm/index";
import { amount, PublicKey } from '@metaplex-foundation/js';
import { getTokenMetadata, getUserTokenBalanceAndDetails } from '../../service/feeds';

import { formatNumberToKOrM, getSolBalance, getSwapAmountOutPump, updatePositions } from '../../service/util';
import { Keypair, Connection } from '@solana/web3.js';
export const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');
import { getTokenDataFromBirdEyePositions } from '../../api/priceFeeds/birdEye';
import { getSwapDetails, pump_fun_swap } from '../../service/dex/pumpfun';
import { UserPositions } from '../../db/mongo/schema';
import { MVXBOT_FEES, SOL_ADDRESS } from '../../config';
import bs58 from "bs58";
import BigNumber from 'bignumber.js';
import { saveUserPosition } from '../../service/portfolio/positions';



export async function display_cpmm_raydium_details(ctx: any, isRefresh: boolean) { 
    let priority_Level = ctx.session.priorityFees;
    const priority_custom = ctx.session.ispriorityCustomFee;
    if(priority_custom === true){
        priority_Level = 0;
    }
    const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
    const cpmmPoolKey = ctx.session.cpmmPoolId.toBase58();
    // console.log('cpmmPoolKey', cpmmPoolKey);
    ctx.session.cpmmPoolInfo = await getpoolDataCpmm(cpmmPoolKey, connection);
    // console.log('ctx.session.cpmmPoolInfo', ctx.session.cpmmPoolInfo);
    const chatId = ctx.chat.id;
    const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
    const userPublicKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].publicKey;
    const tokenAddress = new PublicKey(ctx.session.cpmmPoolInfo.mintB.address);
    const [
        birdeyeData,
        tokenMetadataResult,
        balanceInSOL,
        userPosition,
        userTokenDetails,
        jupSolPrice
    
      ] = await Promise.all([
        getTokenDataFromBirdEyePositions(tokenAddress.toString(),userPublicKey),
        getTokenMetadata(ctx, tokenAddress.toBase58()),
        getSolBalance(userPublicKey, connection),
        UserPositions.find({ positionChatId: chatId, walletId: userPublicKey }, { positions: { $slice: -7 } }),
        getUserTokenBalanceAndDetails(new PublicKey(userPublicKey), tokenAddress, connection),
        fetch(
          `https://price.jup.ag/v6/price?ids=SOL`
        ).then((response) => response.json()),
      ]);
         const priceCpmm = ctx.session.cpmmPoolInfo.mintAmountA / ctx.session.cpmmPoolInfo.mintAmountB;

        const solPrice = birdeyeData ? birdeyeData.solanaPrice.data.value :  Number(jupSolPrice.data.SOL.price);
        console.log('cpmmPrice', priceCpmm * solPrice);

        const { userTokenBalance, decimals, userTokenSymbol } = userTokenDetails;
        const tokenPriceUSD = birdeyeData
        && birdeyeData.response
        && birdeyeData.response.data
        && birdeyeData.response.data.price != null  // This checks for both null and undefined
        ? birdeyeData.response.data.price
        : priceCpmm * solPrice;

        console.log('tokenPriceUSD', tokenPriceUSD);
}   