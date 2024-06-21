import {getpoolDataCpmm} from "../../service/dex/raydium/cpmm/index";
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


}