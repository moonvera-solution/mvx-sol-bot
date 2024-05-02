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


  export  async function runAllFees(ctx: any, raydiumId: any) {
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);
   const priorityCalculation = ctx.session.activeTradingPool.id? ctx.session.activeTradingPool.id : raydiumId;
    
    const [result, result2,result3,result4] = await Promise.all([
      getMaxPrioritizationFeeByPercentile(connection, {
          lockedWritableAccounts: [
              new PublicKey(priorityCalculation),
          ],
          percentile: PriotitizationFeeLevels.LOW,
          fallback: false,
      }),
      getMaxPrioritizationFeeByPercentile(connection, {
        lockedWritableAccounts: [
            new PublicKey(priorityCalculation),
        ],
        percentile: PriotitizationFeeLevels.MEDIUM,
        fallback: false,
    }),
    getMaxPrioritizationFeeByPercentile(connection, {
      lockedWritableAccounts: [
          new PublicKey(priorityCalculation),
      ],
      percentile: PriotitizationFeeLevels.HIGH,
      fallback: false,
  }),
    getMaxPrioritizationFeeByPercentile(connection, {
    lockedWritableAccounts: [
        new PublicKey(priorityCalculation),
    ],
    percentile: PriotitizationFeeLevels.MAX,
    fallback: false,
    }),
          // console.log('result_Min', result);
  ]);
  return {result, result2,result3,result4};
  // console.log('result_Min', result);
      // return {result, result2,result3,result4};  
  }


