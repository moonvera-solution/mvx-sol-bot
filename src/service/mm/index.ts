
import { getSolBalance, generateSolanaWallet } from '../../service/util';
import { Dex } from "../../service/util/types";
import { run_mm_sequence } from "../../api/mm";
import { MarketMakers } from "../../db/mongo/schema";
import bs58 from 'bs58';

export async function createFundingWallet(): Promise<{ publicKey: string, secretKey: string }> {
    let { publicKey, secretKey } = generateSolanaWallet();
    return { publicKey, secretKey: bs58.encode(secretKey) };
}

function getDex(dex: string) {
    switch (dex) {
        case 'amm':
            return Dex.AMM;
        case 'cpmm':
            return Dex.CPMM;
        case 'pumpfun':
            return Dex.PUMP;
    }
}

export async function run_1M_MM(ctx: any) {
    const mmToken = ctx.session.mmToken;
    const userWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];
    await run_mm_sequence({
        token: mmToken,
        amm: getDex(ctx.session.mmDex)!,
        cycles: 2,
        numWallets: 2,
        tradesPerWallet: 2,
        fundingAmount: 20000000,
        fundsPerWallet: 10000000,
        fundingWallet: userWallet.publicKey,
        userWallet: userWallet.publicKey
    });
}