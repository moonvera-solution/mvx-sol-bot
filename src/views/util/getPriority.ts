import { Connection, GetRecentPrioritizationFeesConfig } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import {
  PriotitizationFeeLevels,
//   getMaxPrioritizationFeeByPercentile,
//   getMeanPrioritizationFeeByPercentile,
  getMedianPrioritizationFeeByPercentile,
  getMinPrioritizationFeeByPercentile,
  getRecentPrioritizationFeesByPercentile,
} from "../../service/fees/priorityFees";
import { run } from "node_modules/grammy/out/composer";
const connection = new Connection('https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41');

interface GetRecentPrioritizationFeesByPercentileConfig
  extends GetRecentPrioritizationFeesConfig {
  percentile?: PriotitizationFeeLevels | number;
  fallback?: boolean;
}

const getMaxPrioritizationFeeByPercentile = async (
    connection: Connection,
    config: GetRecentPrioritizationFeesByPercentileConfig,
    slotsToReturn?: number
): Promise<number> => {
    
    const recentPrioritizationFees =
        await getRecentPrioritizationFeesByPercentile(
            connection,
            config,
            slotsToReturn
        );
        
    // console.log('recentPrioritizationFees', recentPrioritizationFees);
    const maxPriorityFee = recentPrioritizationFees[0].prioritizationFee;
    // console.log('maxPriorityFee', maxPriorityFee);
    
    return maxPriorityFee;
};

 const getMeanPrioritizationFeeByPercentile = async (
    connection: Connection,
    config: GetRecentPrioritizationFeesByPercentileConfig,
    slotsToReturn?: number
  ): Promise<number> => {
    const recentPrioritizationFees =
      await getRecentPrioritizationFeesByPercentile(
        connection,
        config,
        slotsToReturn
      );
  
    const mean = Math.ceil(
      recentPrioritizationFees.reduce(
        (acc, fee) => acc + fee.prioritizationFee,
        0
      ) / recentPrioritizationFees.length
    );
  
    return mean;
  };



export  async function runMin(ctx: any, raydiumId: any) {
 const priorityCalculation = ctx.session.activeTradingPool.id? ctx.session.activeTradingPool.id : raydiumId;
    const result = await getMaxPrioritizationFeeByPercentile(connection, {
        lockedWritableAccounts: [
            new PublicKey(priorityCalculation),
        ],
        percentile: PriotitizationFeeLevels.LOW,
        fallback: false,
    });
    return result;  
    // console.log('result_Min', result);
}
export async function runMedium(ctx: any, raydiumId: any) {
  const priorityCalculation = ctx.session.activeTradingPool.id? ctx.session.activeTradingPool.id : raydiumId;

    const result = await getMaxPrioritizationFeeByPercentile(connection, {
        lockedWritableAccounts: [
            new PublicKey(priorityCalculation),
        ],
        percentile: PriotitizationFeeLevels.MEDIUM,
        fallback: false,
    });
    return result;
    // console.log('result_Medium', result);
}

export async function runHigh(ctx: any, raydiumId: any) {
  const priorityCalculation = ctx.session.activeTradingPool.id? ctx.session.activeTradingPool.id : raydiumId;
    const result = await getMaxPrioritizationFeeByPercentile(connection, {
        lockedWritableAccounts: [
            new PublicKey(priorityCalculation),
        ],
        percentile: PriotitizationFeeLevels.HIGH,
        fallback: false,
    });

    return result;
    // console.log('result_High', result);
}

export async function runMax(ctx: any, raydiumId: any) {
  const priorityCalculation = ctx.session.activeTradingPool.id? ctx.session.activeTradingPool.id : raydiumId;

    const result = await getMaxPrioritizationFeeByPercentile(connection, {
        lockedWritableAccounts: [
            new PublicKey(priorityCalculation),
        ],
        percentile: PriotitizationFeeLevels.MAX,
        fallback: false,
    });
    return result;
    // console.log('result_Max', result);
}
// runMin();
// runMedium();
// runHigh();
// runMax();
// export async function runAllPriorities() {
//     const results: Record<PriotitizationFeeLevels, any> = {
//         [PriotitizationFeeLevels.LOW]: undefined,
//         [PriotitizationFeeLevels.MEDIUM]: undefined,
//         [PriotitizationFeeLevels.HIGH]: undefined,
//         [PriotitizationFeeLevels.MAX]: undefined
//     }; 

//     const levels = {
//         LOW: PriotitizationFeeLevels.LOW,
//         MEDIUM: PriotitizationFeeLevels.MEDIUM,
//         HIGH: PriotitizationFeeLevels.HIGH,
//         MAX: PriotitizationFeeLevels.MAX,
//     };

//     for (const level of Object.keys(levels) as Array<keyof typeof levels>) {
//         const levelKey = levels[level];
//         results[levelKey] = await getMaxPrioritizationFeeByPercentile(connection, {
//             lockedWritableAccounts: [
//                 new PublicKey('EmWBT1DAcguN1iWSfQCjX6gdyEpNTuFrukKJoFG2uYs'),
//             ],
//             percentile: levelKey,
//             fallback: false,
//         });
//     }
//     console.log('results', results);

//     return results;
//     // console.log('results', results);
// }

// runAllPriorities();