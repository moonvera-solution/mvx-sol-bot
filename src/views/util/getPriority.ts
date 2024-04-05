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
  const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);
 const priorityCalculation = ctx.session.activeTradingPool.id? ctx.session.activeTradingPool.id : raydiumId;
    const result = await getMaxPrioritizationFeeByPercentile(connection, {
        lockedWritableAccounts: [
            new PublicKey(priorityCalculation),
            new PublicKey(raydiumId)
        ],
        percentile: PriotitizationFeeLevels.LOW,
        fallback: false,
    });
        console.log('result_Min', result);
    return result;  
}
export async function runMedium(ctx: any, raydiumId: any) {
  const priorityCalculation = ctx.session.activeTradingPool.id? ctx.session.activeTradingPool.id : raydiumId;
  const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);

    const result = await getMaxPrioritizationFeeByPercentile(connection, {
        lockedWritableAccounts: [
            new PublicKey(priorityCalculation),
            new PublicKey(raydiumId)
        ],
        percentile: PriotitizationFeeLevels.MEDIUM,
        fallback: false,
    });
        console.log('result_Medium', result);
    return result;
}

export async function runHigh(ctx: any, raydiumId: any) {
  const priorityCalculation = ctx.session.activeTradingPool.id? ctx.session.activeTradingPool.id : raydiumId;
  const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);
    const result = await getMaxPrioritizationFeeByPercentile(connection, {
        lockedWritableAccounts: [
            new PublicKey(priorityCalculation),
            new PublicKey(raydiumId)
        ],
        percentile: PriotitizationFeeLevels.HIGH,
        fallback: false,
    });
        console.log('result_High', result);

    return result;
}

export async function runMax(ctx: any, raydiumId: any) {
  const priorityCalculation = ctx.session.activeTradingPool.id? ctx.session.activeTradingPool.id : raydiumId;
  const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);

    const result = await getMaxPrioritizationFeeByPercentile(connection, {
        lockedWritableAccounts: [
            new PublicKey(priorityCalculation),
            new PublicKey(raydiumId)
        ],
        percentile: PriotitizationFeeLevels.MAX,
        fallback: false,
    });
        console.log('result_Max', result);
    return result;
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