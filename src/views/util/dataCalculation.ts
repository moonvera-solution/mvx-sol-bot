import { PublicKey, Connection } from '@solana/web3.js';
import {_getReservers} from '../../service/dex/raydium/market-data/2_Strategy';
import BigNumber from 'bignumber.js';
import { getSolanaDetails } from '../../api';
import { token } from '@metaplex-foundation/js';

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

export async function quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply }: { baseVault: PublicKey, quoteVault: PublicKey, baseDecimals: number, quoteDecimals: number, baseSupply: PublicKey }): Promise<{ price: BigNumber, marketCap: BigNumber, liquidity: number }> {
    let { baseTokenVaultSupply, quoteTokenVaultSupply, baseTokenSupply} = await getPoolToken_details(baseVault, quoteVault, baseSupply);
    if (quoteDecimals < baseDecimals) {
        baseTokenVaultSupply = new BigNumber(baseTokenVaultSupply.toNumber() * Math.pow(10, quoteDecimals - baseDecimals));
    } else if (baseDecimals < quoteDecimals) {
        quoteTokenVaultSupply = new BigNumber(quoteTokenVaultSupply.toNumber() * Math.pow(10, baseDecimals - quoteDecimals));
    }
    const price: BigNumber = quoteTokenVaultSupply.div(baseTokenVaultSupply);  
    const marketCap: BigNumber = price.times(baseTokenSupply.dividedBy(Math.pow(10, baseDecimals)));
    
   
    const liquidityInfo:BigNumber = quoteTokenVaultSupply;
    const liquidity =  (liquidityInfo ).toNumber() *  Math.pow(10, - baseDecimals )
    // console.log('liquidity', liquidity);
    
    return { price, marketCap, liquidity };
} 
