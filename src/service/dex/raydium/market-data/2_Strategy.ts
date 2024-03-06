import base58 from "bs58";
import { buildAndSendTx } from "../../../util";
import {
    MARKET_STATE_LAYOUT_V3, Liquidity, TokenAmount,
    Token, Percent, SPL_ACCOUNT_LAYOUT, ApiPoolInfoV4,
    LiquidityPoolKeysV4, TOKEN_PROGRAM_ID, TokenAccount,
    Market, SPL_MINT_LAYOUT, TxVersion
} from "@raydium-io/raydium-sdk";
import BigNumber from 'bignumber.js';
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
const log = (k: any, v: any) => console.log(k, v);

const URL_ONE = 'https://moonvera-ams.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41';
const URL_TWO = 'https://moonvera.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41';
const connection = new Connection(URL_ONE);

const AMOUNT_IN = new BigNumber(40000000); // 20 USD
const SLIPPAGE_PERCENT = new BigNumber(20);
const EXPECTED_PROFIT_PERCENT = new BigNumber(10);
const NUMBER_OF_PRICE_lOOK_UP_ITERATIONS = 10000;
const makeTxVersion = TxVersion.V0; // LEGACY

export async function trade(poolKeys: any): Promise<boolean> {
    let isDone = false;
    if (poolKeys && poolKeys.id && poolKeys.baseMint && poolKeys.quoteMint) {

        console.log("base", poolKeys.baseMint.toBase58());
        console.log("quote", poolKeys.quoteMint.toBase58());
        console.log("poolId", poolKeys.id.toBase58());
        console.log("decimals", poolKeys.baseDecimals);

        const presentValue = await _quote({ // in token NOT sol
            amountIn: AMOUNT_IN, baseVault: poolKeys.quoteVault,
            quoteVault: poolKeys.baseVault, baseDecimals: poolKeys.quoteDecimals, quoteDecimals: poolKeys.baseDecimals
        });

        let amountOut = presentValue.minus(presentValue.multipliedBy(SLIPPAGE_PERCENT.dividedBy(100)));

        log("amountOut", amountOut.toNumber());

        // call open websocket to wallet event
        // connect();

        // swap in AMOUNT_IN in SOL
        const buyTx = await _swap({
            poolKeys: poolKeys,
            tokenIn: poolKeys.quoteMint,
            tokenInDecimals: poolKeys.quoteDecimals,
            tokenOut: poolKeys.baseMint,
            tokenOutDecimals: poolKeys.baseDecimals,
            amountIn: AMOUNT_IN,
            amountOut: new BigNumber(amountOut.toFixed(0))
        });
        log("buyTx: ", buyTx);
        // connect(buyTx);

        // receive data from websocket

        // fetch logs of buy
        // const userWallet = Keypair.fromSecretKey(base58.decode(String('2jaFhsbZMy8n7HzMAKrVYADqi5cYhKca7fWpet1gKGtb8X4EW7k1ZqpX7Qdr5NAaV4wTEK6L2mHvEFNaPg7sFR9L')));
        const userTokenBalance = new BigNumber(amountOut.toFixed(0));//await _getSwapAmountOut(connection, userWallet.publicKey, String(buyTx[0]));

        let iterations = 0;

        const baseVault = poolKeys.baseVault;
        const quoteVault = poolKeys.quoteVault;
        const baseDecimals = poolKeys.baseDecimals;
        const quoteDecimals = poolKeys.quoteDecimals;

        const EXPECTED_PROFIT = new BigNumber(userTokenBalance.plus(userTokenBalance.multipliedBy(EXPECTED_PROFIT_PERCENT.dividedBy(100))).toFixed(0));

        while (iterations < NUMBER_OF_PRICE_lOOK_UP_ITERATIONS) { // update to open another socket connection to fetch price updates

            const futureValue = await _quote({ // shitcoin to sol => futureValue sol
                amountIn: userTokenBalance, baseVault: baseVault,
                quoteVault: quoteVault, baseDecimals: baseDecimals, quoteDecimals: quoteDecimals
            });
            const profit: BigNumber = futureValue.minus(userTokenBalance.toNumber());

            log("futureValue", futureValue.toNumber());
            log("expected", EXPECTED_PROFIT.toNumber());
            log("profit", profit.toNumber());

            if (profit.gt(EXPECTED_PROFIT)) {
                const sellTx = await _swap({
                    poolKeys: poolKeys,
                    tokenIn: poolKeys.baseMint,
                    tokenInDecimals: poolKeys.baseDecimals,
                    tokenOut: poolKeys.quoteMint,
                    tokenOutDecimals: poolKeys.quoteDecimals,
                    amountIn: userTokenBalance,
                    amountOut: EXPECTED_PROFIT
                });
                log("sellTx: ", sellTx);
                break;
            }
            iterations++;
            log("i", iterations);
            isDone = true;
        }
    }
    return isDone;
}
export async function filterPoolsCallback(data: any, programId: string) {
    let parsedData = JSON.parse(data);
    if (!parsedData.filters.includes('transactionsSubKey')) return undefined;
    const info = parsedData.transaction;
    if (info && info.transaction && info.transaction.meta && info.transaction.meta.err !== undefined) return undefined;
    // if (info && info.transaction && info.transaction.meta && info.transaction.meta.logMessages.includes('open_time')) return undefined;


    const accounts = info.transaction.transaction.message.accountKeys.map((i: any) => base58.encode(i.data));

    for (const item of [
        ...info.transaction.transaction.message.instructions,
        ...info.transaction.meta.innerInstructions.map((i: any) => i.instructions).flat()
    ]) {

        if (accounts[item.programIdIndex] !== programId) continue;
        if ([...(item.data.data as Buffer).values()][0] != 1) continue;

        const keyIndex = [...(item.accounts.data as Buffer).values()]
        const [baseMintAccount, quoteMintAccount, marketAccount] = await connection.getMultipleAccountsInfo([
            new PublicKey(accounts[keyIndex[8]]),
            new PublicKey(accounts[keyIndex[9]]),
            new PublicKey(accounts[keyIndex[16]]),
        ], 'processed');

        if (baseMintAccount === null || quoteMintAccount === null || marketAccount === null) continue; //throw Error('get account info error')

        const baseMintInfo = SPL_MINT_LAYOUT.decode(baseMintAccount.data)
        const quoteMintInfo = SPL_MINT_LAYOUT.decode(quoteMintAccount.data)
        const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data)

        const poolKeys = {
            id: new PublicKey(accounts[keyIndex[4]]),
            baseMint: new PublicKey(accounts[keyIndex[8]]),
            quoteMint: new PublicKey(accounts[keyIndex[9]]),
            lpMint: new PublicKey(accounts[keyIndex[7]]),
            baseDecimals: baseMintInfo.decimals,
            quoteDecimals: quoteMintInfo.decimals,
            lpDecimals: baseMintInfo.decimals,
            version: Number(4) as 4,
            programId: new PublicKey(programId),
            authority: new PublicKey(accounts[keyIndex[5]]),
            openOrders: new PublicKey(accounts[keyIndex[6]]),
            targetOrders: new PublicKey(accounts[keyIndex[12]]),
            baseVault: new PublicKey(accounts[keyIndex[10]]),
            quoteVault: new PublicKey(accounts[keyIndex[11]]),
            withdrawQueue: PublicKey.default.toString(),
            lpVault: PublicKey.default.toString(),
            marketVersion: Number(3) as 3,
            marketProgramId: marketAccount.owner.toString(),
            marketId: accounts[keyIndex[16]],
            marketAuthority: Market.getAssociatedAuthority({ programId: marketAccount.owner, marketId: new PublicKey(accounts[keyIndex[16]]) }).publicKey.toString(),
            marketBaseVault: marketInfo.baseVault.toString(),
            marketQuoteVault: marketInfo.quoteVault.toString(),
            marketBids: marketInfo.bids.toString(),
            marketAsks: marketInfo.asks.toString(),
            marketEventQueue: marketInfo.eventQueue.toString(),
            lookupTableAccount: PublicKey.default.toString()
        };
        const convertedPoolKeys: LiquidityPoolKeysV4 = {
            ...poolKeys,
            withdrawQueue: new PublicKey(poolKeys.withdrawQueue),
            lpVault: new PublicKey(poolKeys.lpVault),
            marketProgramId: new PublicKey(poolKeys.marketProgramId),
            marketId: new PublicKey(poolKeys.marketId),
            marketAuthority: new PublicKey(poolKeys.marketAuthority),
            marketBaseVault: new PublicKey(poolKeys.marketBaseVault),
            marketQuoteVault: new PublicKey(poolKeys.marketQuoteVault),
            marketBids: new PublicKey(poolKeys.marketBids),
            marketAsks: new PublicKey(poolKeys.marketAsks),
            marketEventQueue: new PublicKey(poolKeys.marketEventQueue),
            lookupTableAccount: new PublicKey(poolKeys.lookupTableAccount),
        };
        return convertedPoolKeys;
    }
}
async function _getWalletTokenAccount(connection: Connection, wallet: PublicKey): Promise<TokenAccount[]> {
    const walletTokenAccount = await connection.getTokenAccountsByOwner(wallet, {
        programId: TOKEN_PROGRAM_ID,
    }, 'processed');
    return walletTokenAccount.value.map((i) => ({
        pubkey: i.pubkey,
        programId: i.account.owner,
        accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
    }));
}
async function _swap({ poolKeys, tokenIn, tokenInDecimals, tokenOut, tokenOutDecimals, amountIn, amountOut,
}: SwapParams): Promise<string[]> {

    const userWallet = Keypair.fromSecretKey(base58.decode(String('2jaFhsbZMy8n7HzMAKrVYADqi5cYhKca7fWpet1gKGtb8X4EW7k1ZqpX7Qdr5NAaV4wTEK6L2mHvEFNaPg7sFR9L')));

    const walletTokenAccounts = await _getWalletTokenAccount(connection, userWallet.publicKey);

    // ASSETS
    const _tokenIn: Token = new Token(TOKEN_PROGRAM_ID, tokenIn, tokenInDecimals, '', '');
    const _tokenOut: Token = new Token(TOKEN_PROGRAM_ID, tokenOut, tokenOutDecimals, '', '');

    // AMOUNTS
    const inputTokenAmount = new TokenAmount(_tokenIn, amountIn.toNumber(), true);
    const minOutTokenAmount = new TokenAmount(_tokenOut, amountOut.toNumber(), true);

    const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
        connection,
        poolKeys: poolKeys,
        userKeys: {
            tokenAccounts: walletTokenAccounts,
            owner: userWallet.publicKey,
        },
        amountIn: inputTokenAmount,
        amountOut: minOutTokenAmount,
        fixedSide: 'out',
        makeTxVersion,
    });
    return await buildAndSendTx(userWallet, innerTransactions);
}
export async function _getReservers(_baseVault: PublicKey, _quoteVault: PublicKey): Promise<{ baseTokenVaultSupply: BigNumber, quoteTokenVaultSupply: BigNumber }> {
    const baseVault: any = await connection.getParsedAccountInfo(new PublicKey(_baseVault), "processed");
    const quoteVault: any = await connection.getParsedAccountInfo(new PublicKey(_quoteVault), "processed");
    // console.log('baseTokenVaultSupply', baseVault.value?.data.parsed.info.tokenAmount)
    return {
        baseTokenVaultSupply: new BigNumber(baseVault.value?.data.parsed.info.tokenAmount.amount),
        quoteTokenVaultSupply: new BigNumber(quoteVault.value?.data.parsed.info.tokenAmount.amount)
    }
  
}
async function _quote({ amountIn, baseVault, quoteVault, baseDecimals, quoteDecimals }: QuoteParams): Promise<BigNumber> {
    let { baseTokenVaultSupply, quoteTokenVaultSupply } = await _getReservers(baseVault, quoteVault);
    if (baseDecimals < quoteDecimals) {
        baseTokenVaultSupply = new BigNumber(baseTokenVaultSupply.toNumber() * Math.pow(10, quoteDecimals - baseDecimals));
    } else if (quoteDecimals < baseDecimals) {
        quoteTokenVaultSupply = new BigNumber(quoteTokenVaultSupply.toNumber() * Math.pow(10, baseDecimals - quoteDecimals));
    }
    const price: BigNumber = quoteTokenVaultSupply.div(baseTokenVaultSupply);
    return new BigNumber(amountIn.times(price).div(10 ** quoteDecimals)) // first swap amount out
}
async function _getSwapAmountOut(connection: Connection, userWallet: PublicKey, txString: string): Promise<BigNumber> {
    let amountOut: BigNumber = new BigNumber(0);
    let tx = await connection.getParsedTransaction(txString, {"maxSupportedTransactionVersion": 0 });
    log("tx", tx)
    tx && JSON.parse(JSON.stringify(tx)).meta.innerInstructions.map((i:any) => {
        i.instructions.map((j:any) => {
            if (j.parsed.type === 'transfer' && j.parsed.info.authority !== userWallet.toBase58()) {
                amountOut = new BigNumber(j.parsed.info.amount);
            }
        })
    });
    return amountOut;
}
interface QuoteParams {
    amountIn: BigNumber;
    baseVault: PublicKey;
    quoteVault: PublicKey;
    baseDecimals: number;
    quoteDecimals: number;
}
interface SwapParams {
    poolKeys: LiquidityPoolKeysV4,
    tokenIn: PublicKey,
    tokenInDecimals: number,
    tokenOut: PublicKey,
    tokenOutDecimals: number,
    amountIn: BigNumber,
    amountOut: BigNumber
}
async function test() {
    const URL_TWO = 'https://moonvera.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41';
 const connection = new Connection(URL_ONE);
 const userWallet = Keypair.fromSecretKey(base58.decode(String('2jaFhsbZMy8n7HzMAKrVYADqi5cYhKca7fWpet1gKGtb8X4EW7k1ZqpX7Qdr5NAaV4wTEK6L2mHvEFNaPg7sFR9L')));

    const tx = "2pcoYrf4QUXzdZNm3yd1yxBHW7KDCzQcwtPCAwNNQfoFR1pQzYjoNCB2kNboTD6STfNoT914Gex3tiMMmR5ZhS8o";
    const res = await _getSwapAmountOut(connection,userWallet.publicKey,tx);
    console.log(res);
}

// test().then(() => console.log('done')).catch((e) => console.log(e));