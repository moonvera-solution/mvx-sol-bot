import { PublicKey, Connection } from '@solana/web3.js';
import BigNumber from 'bignumber.js';




export async function getPoolToken_details(tokenBaseVault: PublicKey, tokenQuoteVault: PublicKey, baseMint: PublicKey, connection: Connection): 
Promise<{ baseTokenVaultSupply: BigNumber, quoteTokenVaultSupply: BigNumber, baseTokenSupply: BigNumber }> {
    const publicKeys = [
        new PublicKey(tokenBaseVault),
        new PublicKey(tokenQuoteVault),
        new PublicKey(baseMint)
    ];
    const parsedAccountsInfo = await connection.getMultipleParsedAccounts(publicKeys, { commitment: 'processed' });
    // Type checking and extracting data
    const baseTokenVaultSupply = parsedAccountsInfo.value[0]?.data instanceof Buffer ? new BigNumber(0) : new BigNumber(parsedAccountsInfo.value[0]?.data.parsed.info.tokenAmount.amount);
    const quoteTokenVaultSupply = parsedAccountsInfo.value[1]?.data instanceof Buffer ? new BigNumber(0) : new BigNumber(parsedAccountsInfo.value[1]?.data.parsed.info.tokenAmount.amount);
    const baseTokenSupply = parsedAccountsInfo.value[2]?.data instanceof Buffer ? new BigNumber(0) : new BigNumber(parsedAccountsInfo.value[2]?.data.parsed.info.supply);

    return {
        baseTokenVaultSupply,
        quoteTokenVaultSupply,
        baseTokenSupply,
    }
}

export async function quoteToken({ baseVault, quoteVault, baseDecimals, quoteDecimals, baseSupply, connection }:
    { baseVault: PublicKey, quoteVault: PublicKey, baseDecimals: number, quoteDecimals: number, baseSupply: PublicKey, connection: Connection}):
    Promise<{ price: BigNumber, marketCap: BigNumber, liquidity: number, priceImpact: number, priceImpact_1: number, baseTokenSupply: BigNumber }> {
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
    const priceImpact = newPrice.minus(price).div(price).times(100).toNumber();
    const priceImpact_1 = newPrice_1.minus(price).div(price).times(100).toNumber();
    // liquid
    const liquidityInfo: BigNumber = quoteTokenVaultSupply;
    const liquidity = liquidityInfo.toNumber() * Math.pow(10, -baseDecimals);

    return { price, marketCap, liquidity, priceImpact, priceImpact_1, baseTokenSupply};
}


