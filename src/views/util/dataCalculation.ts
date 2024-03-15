import { PublicKey, Connection } from '@solana/web3.js';
import {_getReservers} from '../../service/dex/raydium/market-data/2_Strategy';
import BigNumber from 'bignumber.js';
import { getSolanaDetails } from '../../api';
import { token } from '@metaplex-foundation/js';
import  Percent  from 'bignumber.js';

const connection_only = new Connection('https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41'); // TRITON


export async function getPoolToken_details(tokenBaseVault: PublicKey, tokenQuoteVault: PublicKey, baseMint: PublicKey): Promise<{ baseTokenVaultSupply: BigNumber, quoteTokenVaultSupply: BigNumber, baseTokenSupply: BigNumber}> {
    const baseVault: any = await connection_only.getParsedAccountInfo(new PublicKey(tokenBaseVault), "processed");
    const quoteVault: any = await connection_only.getParsedAccountInfo(new PublicKey(tokenQuoteVault), "processed");
    const baseSupply: any = await connection_only.getParsedAccountInfo(new PublicKey(baseMint), "processed");
  
    return {
        baseTokenVaultSupply: new BigNumber(baseVault.value?.data.parsed.info.tokenAmount.amount),
        quoteTokenVaultSupply: new BigNumber(quoteVault.value?.data.parsed.info.tokenAmount.amount),
        baseTokenSupply: new BigNumber(baseSupply.value?.data.parsed.info.supply),
    }
}

export async function quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply }: { baseVault: PublicKey, quoteVault: PublicKey, baseDecimals: number, quoteDecimals: number, baseSupply: PublicKey }): Promise<{ price: BigNumber, marketCap: BigNumber, liquidity: number, priceImpact: number, priceImpact_1: number }> {
    let { baseTokenVaultSupply, quoteTokenVaultSupply, baseTokenSupply} = await getPoolToken_details(baseVault, quoteVault, baseSupply);
    if (quoteDecimals < baseDecimals) {
        baseTokenVaultSupply = new BigNumber(baseTokenVaultSupply.toNumber() * Math.pow(10, quoteDecimals - baseDecimals));
    } else if (baseDecimals < quoteDecimals) {
        quoteTokenVaultSupply = new BigNumber(quoteTokenVaultSupply.toNumber() * Math.pow(10, baseDecimals - quoteDecimals));
    }
    const price: BigNumber = quoteTokenVaultSupply.div(baseTokenVaultSupply);  
    const marketCap: BigNumber = price.times(baseTokenSupply.dividedBy(Math.pow(10, baseDecimals)));
    // price impact calculation
    const tradeAmount_SOL = new BigNumber(5).times(Math.pow(10, baseDecimals)); // 5 SOL in lamports
    const tradeAmount_SOL_1 = new BigNumber(1).times(Math.pow(10, baseDecimals)); // 1 SOL in lamports
    const newQuoteVaultSupply = quoteTokenVaultSupply.plus(tradeAmount_SOL);
    const newQuoteVaultSupply_1 = quoteTokenVaultSupply.plus(tradeAmount_SOL_1);
    const newBaseVaultSupply = baseTokenVaultSupply.times(quoteTokenVaultSupply).div(newQuoteVaultSupply);
    const newBaseVaultSupply_1 = baseTokenVaultSupply.times(quoteTokenVaultSupply).div(newQuoteVaultSupply_1);
    const tokenReceived = (baseTokenVaultSupply.minus(newBaseVaultSupply));
    const tokenReceived_1 = (baseTokenVaultSupply.minus(newBaseVaultSupply_1));
 

    const newPrice = new BigNumber(tradeAmount_SOL.toNumber() / tokenReceived.toNumber());
    const newPrice_1 = new BigNumber(tradeAmount_SOL_1.toNumber() / tokenReceived_1.toNumber());
    // console.log('newprice', newPrice.toNumber() );

    const priceImpact = newPrice.minus(price).div(price).times(100).toNumber();
    const priceImpact_1 = newPrice_1.minus(price).div(price).times(100).toNumber();
    // console.log('priceImpact', priceImpact);
  // liquid
    const liquidityInfo: BigNumber = quoteTokenVaultSupply;
    const liquidity = liquidityInfo.toNumber() * Math.pow(10, -baseDecimals);
    // console.log('liquidity', liquidity);
    
    return { price, marketCap, liquidity, priceImpact, priceImpact_1 };
} 


