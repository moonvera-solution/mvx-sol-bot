import { PublicKey, Connection } from '@solana/web3.js';
import BigNumber from 'bignumber.js';




export async function getPoolToken_details(tokenBaseVault: PublicKey, tokenQuoteVault: PublicKey, baseMint: PublicKey, connection: Connection): 
Promise<{ baseTokenVaultSupply: BigNumber, quoteTokenVaultSupply: BigNumber, baseTokenSupply: BigNumber }> {
    const [baseVault, quoteVault, baseSupply] = await Promise.all([
        connection.getParsedAccountInfo(new PublicKey(tokenBaseVault), "processed"),
        connection.getParsedAccountInfo(new PublicKey(tokenQuoteVault), "processed"),
        connection.getParsedAccountInfo(new PublicKey(baseMint), "processed")
    ]);

    // Type checking and extracting data
    const baseTokenVaultSupply = baseVault.value?.data instanceof Buffer ? new BigNumber(0) : new BigNumber(baseVault.value?.data.parsed.info.tokenAmount.amount);
    const quoteTokenVaultSupply = quoteVault.value?.data instanceof Buffer ? new BigNumber(0) : new BigNumber(quoteVault.value?.data.parsed.info.tokenAmount.amount);
    const baseTokenSupply = baseSupply.value?.data instanceof Buffer ? new BigNumber(0) : new BigNumber(baseSupply.value?.data.parsed.info.supply);

    return {
        baseTokenVaultSupply,
        quoteTokenVaultSupply,
        baseTokenSupply,
    }
}



export async function quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply, connection }:
    { baseVault: PublicKey, quoteVault: PublicKey, baseDecimals: number, quoteDecimals: number, baseSupply: PublicKey, connection: Connection}):
    Promise<{ price: BigNumber, marketCap: BigNumber, liquidity: number, priceImpact: number, priceImpact_1: number }> {
    let { baseTokenVaultSupply, quoteTokenVaultSupply, baseTokenSupply } = await getPoolToken_details(baseVault, quoteVault, baseSupply,connection);
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


