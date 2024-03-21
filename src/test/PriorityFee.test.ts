import { Connection, GetRecentPrioritizationFeesConfig } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import {
  PriotitizationFeeLevels,
//   getMaxPrioritizationFeeByPercentile,
  getMeanPrioritizationFeeByPercentile,
  getMedianPrioritizationFeeByPercentile,
  getMinPrioritizationFeeByPercentile,
  getRecentPrioritizationFeesByPercentile,
} from "../service/portfolio/strategies/priorityFees";
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
        
    console.log('recentPrioritizationFees', recentPrioritizationFees);
    const maxPriorityFee = recentPrioritizationFees[0].prioritizationFee;
    console.log('maxPriorityFee', maxPriorityFee);
    
    return maxPriorityFee;
};

async function run() {
    const result = await getMaxPrioritizationFeeByPercentile(connection, {
        lockedWritableAccounts: [
            new PublicKey("9Ttyez3xiruyj6cqaR495hbBkJU6SUWdV6AmQ9MvbyyS"),
        ],
        percentile: PriotitizationFeeLevels.MAX,
        fallback: false,
    });
    console.log('result', result);
}

run();
