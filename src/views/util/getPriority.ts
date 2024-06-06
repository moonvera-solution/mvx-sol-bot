import { Connection, GetRecentPrioritizationFeesConfig } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { PriotitizationFeeLevels, getRecentPrioritizationFeesByPercentile } from "../../service/fees/priorityFees";

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


export async function runAllFees(ctx: any, amm: any) {
  const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
  const priorityCalculation = amm ? amm : ctx.session.pumpToken;

  const [result2, result3, result4] = await Promise.all([

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
  ]);
  return { result2, result3, result4 };
}

// export  async function runPriorityLevels(ctx: any, ammKey: any) {
//   const connection = new Connection(`${ctx.session.tritonRPC}${ctx.session.tritonToken}`);
//  const priorityCalculation = ammKey? ammKey : ctx.session.jupSwap_token;

//   const [result2,result3,result4] = await Promise.all([

//     getMaxPrioritizationFeeByPercentile(connection, {
//       lockedWritableAccounts: [
//           new PublicKey(priorityCalculation),
//       ],
//       percentile: PriotitizationFeeLevels.LOW,
//       fallback: false,
//   }),
//   getMaxPrioritizationFeeByPercentile(connection, {
//     lockedWritableAccounts: [
//         new PublicKey(priorityCalculation),
//     ],
//     percentile: PriotitizationFeeLevels.MEDIUM,
//     fallback: false,
// }),
//   getMaxPrioritizationFeeByPercentile(connection, {
//   lockedWritableAccounts: [
//       new PublicKey(priorityCalculation),
//   ],
//   percentile: PriotitizationFeeLevels.HIGH,
//   fallback: false,
//   }),
// ]);
// return {result2,result3,result4};
// }


export async function setCustomPriority(ctx: any) {
  const FeeInMicroLamports = (ctx.session.customPriorityFee * 1e9);
  ctx.session.txPriorityFee = FeeInMicroLamports;
  ctx.session.priorityFees = FeeInMicroLamports;
  await ctx.api.sendMessage(ctx.chat.id, `Priority Fee set to ${ctx.session.customPriorityFee} SOL`);
  await ctx.api.sendMessage(ctx.chat.id, `To continue trading please enter a token address`);
  ctx.session.latestCommand = 'jupiter_swap';

  return ctx.session.txPriorityFee;
}