// import { Connection, GetRecentPrioritizationFeesConfig } from "@solana/web3.js";
// import { PublicKey } from "@solana/web3.js";
// import {
//   PriotitizationFeeLevels,
// //   getMaxPrioritizationFeeByPercentile,
// //   getMeanPrioritizationFeeByPercentile,
//   getMedianPrioritizationFeeByPercentile,
//   getMinPrioritizationFeeByPercentile,
//   getRecentPrioritizationFeesByPercentile,
// } from "../src/service/fees/priorityFees";
// const connection = new Connection('https://moonvera-ams.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41');

// interface GetRecentPrioritizationFeesByPercentileConfig
//   extends GetRecentPrioritizationFeesConfig {
//   percentile?: PriotitizationFeeLevels | number;
//   fallback?: boolean;
// }

// const getMaxPrioritizationFeeByPercentile = async (
//     connection: Connection,
//     config: GetRecentPrioritizationFeesByPercentileConfig,
//     slotsToReturn?: number
// ): Promise<number> => {
    
//     const recentPrioritizationFees =
//         await getRecentPrioritizationFeesByPercentile(
//             connection,
//             config,
//             slotsToReturn
//         );
        
//     console.log('recentPrioritizationFees', recentPrioritizationFees);
//     const maxPriorityFee = recentPrioritizationFees[0].prioritizationFee;
//     // console.log('maxPriorityFee', maxPriorityFee);
    
//     return maxPriorityFee;
// };

//  const getMeanPrioritizationFeeByPercentile = async (
//     connection: Connection,
//     config: GetRecentPrioritizationFeesByPercentileConfig,
//     slotsToReturn?: number
//   ): Promise<number> => {
//     const recentPrioritizationFees =
//       await getRecentPrioritizationFeesByPercentile(
//         connection,
//         config,
//         slotsToReturn
//       );
  
//     const mean = Math.ceil(
//       recentPrioritizationFees.reduce(
//         (acc, fee) => acc + fee.prioritizationFee,
//         0
//       ) / recentPrioritizationFees.length
//     );
  
//     return mean;
//   };

//   async function runMean() {
//     const result = await getMeanPrioritizationFeeByPercentile(connection, {
//         lockedWritableAccounts: [
//             new PublicKey("9Ttyez3xiruyj6cqaR495hbBkJU6SUWdV6AmQ9MvbyyS"),
//         ],
//         percentile: PriotitizationFeeLevels.MAX,
//         fallback: false,
//     });
//     console.log('result_Mean', result);
//   }

// async function run() {
//     const result = await getMaxPrioritizationFeeByPercentile(connection, {
//         lockedWritableAccounts: [
//             new PublicKey("9Ttyez3xiruyj6cqaR495hbBkJU6SUWdV6AmQ9MvbyyS"),
//         ],
//         percentile: PriotitizationFeeLevels.MAX,
//         fallback: false,
//     });
//     console.log('result_Max', result);
// }
