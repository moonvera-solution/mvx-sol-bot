import Client, { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import BigNumber from 'bignumber.js';
import {
    MARKET_STATE_LAYOUT_V3, Liquidity, TokenAmount, LiquidityPoolKeys, Token, SPL_ACCOUNT_LAYOUT, InnerSimpleV0Transaction,
    LiquidityPoolKeysV4, TOKEN_PROGRAM_ID, TokenAccount, Market, SPL_MINT_LAYOUT, TxVersion, buildSimpleTransaction, LOOKUP_TABLE_CACHE,
    LIQUIDITY_STATE_LAYOUT_V4, jsonInfo2PoolKeys
} from "@raydium-io/raydium-sdk";
import { Connection, PublicKey, Keypair, SendOptions, SystemProgram, Signer, Transaction, VersionedTransaction, RpcResponseAndContext, TransactionMessage, SimulatedTransactionResponse } from "@solana/web3.js";
import { getPoolKeys } from "../../../../src/service/dex/raydium/market-data/PoolsFilter";
import { connection } from "../../../../config";
import { buildAndSendTx } from '../../util';
import { saveUserPosition } from '../positions';
import { amount, token } from "@metaplex-foundation/js";
const log = (k: any, v: any) => console.log(k, v);
import base58 from 'bs58';
import { getRayPoolKeys, getPoolScheduleFromHistory } from "../../dex/raydium/market-data/1_Geyser";
import { getTokenMetadata } from "../../feeds";
import { waitForConfirmation } from '../../util';


export async function setSnipe(ctx: any, amountIn: any) {
    // Returns either the time to wait or indicates pool is already open
    console.log('ctx.session.priorityFees', ctx.session.priorityFees);

    console.log('Snipe set ...');
    const snipeToken = new PublicKey(ctx.session.activeTradingPool.baseMint);
    console.log('snipeToken', snipeToken.toBase58());
    const rayPoolKeys = await getRayPoolKeys(snipeToken.toBase58());
    const poolKeys = jsonInfo2PoolKeys(rayPoolKeys) as LiquidityPoolKeys;
    let liqInfo = await Liquidity.fetchInfo({ connection, poolKeys });
    console.log('liqInfo', liqInfo.startTime.toNumber());
    const amountInLamports = new BigNumber(Number.parseFloat(amountIn)).times(1e9);
    const snipeSlippage = ctx.session.snipeSlippage;
    const currentWalletIdx = ctx.session.activeWalletIndex;
    const currentWallet = ctx.session.portfolio.wallets[currentWalletIdx];
    const {
        birdeyeURL,
        dextoolsURL,
        dexscreenerURL,
        tokenData,
    } = await getTokenMetadata(ctx, snipeToken.toBase58());
    console.log('currentWallet', currentWallet);
    const userKeypair = await Keypair.fromSecretKey(base58.decode(String(currentWallet.secretKey)));
    ctx.api.sendMessage(ctx.chat.id, `▄︻デ══━一    ${amountIn} $${tokenData.symbol} Snipe set...`);

    // Start the simulation without waiting for it to complete
    const poolStartTime = liqInfo.startTime.toNumber();
    const simulationPromise = startSnippeSimulation(ctx, poolKeys, userKeypair, amountInLamports, snipeSlippage, poolStartTime, tokenData);

    simulationPromise.catch((error) => {
        console.log("Error setting snipper", error);
        ctx.api.sendMessage(ctx.chat.id, `Error setting snipper, please try again.`);
    });

    try {
        // Now we wait for the simulation to complete
        await simulationPromise;
    } catch (error) {
        // Errors are already handled above
    }
}

export async function startSnippeSimulation(
    ctx: any,
    poolKeys: any,
    userWallet: Keypair,
    amountIn: BigNumber,
    snipeSlippage: number,
    poolStartTime: number,
    tokenData: any
) {
    const chatId = ctx.chat.id;
    const walletTokenAccounts = await _getWalletTokenAccount(connection, userWallet.publicKey);
    const _tokenIn: Token = new Token(TOKEN_PROGRAM_ID, poolKeys.quoteMint, poolKeys.quoteDecimals, '', '');
    const _tokenOut: Token = new Token(TOKEN_PROGRAM_ID, poolKeys.baseMint, poolKeys.baseDecimals, '', '');

    const amountOut = await _quote({ amountIn: amountIn, baseVault: poolKeys.quoteVault, quoteVault: poolKeys.baseVault });
    const amountOut_with_slippage = new BigNumber(amountOut.minus(amountOut.times(snipeSlippage).div(100)).toFixed(0));

    const inputTokenAmount = new TokenAmount(_tokenIn, amountIn.toFixed(0), true);
    const minOutTokenAmount = new TokenAmount(_tokenOut, amountOut_with_slippage.toFixed(0), true);

    const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
        connection: connection,
        poolKeys: poolKeys,
        userKeys: {
            tokenAccounts: walletTokenAccounts,
            owner: userWallet.publicKey,
        },
        amountIn: inputTokenAmount,
        amountOut: minOutTokenAmount,
        fixedSide: 'in',
        makeTxVersion: TxVersion.V0,
        computeBudgetConfig: {
            units: ctx.session.priorityFees.units,
            microLamports: ctx.session.priorityFees.microLamports
        }
    });
//0.005  0.01 0.05 0.1 0.2
//low   medium high very high extreme
    const mvxFeeInx = SystemProgram.transfer({
        fromPubkey: userWallet.publicKey,
        toPubkey: new PublicKey('MvXfSe3TeEwsEi731Udae7ecReLQPgrNuKWZzX6RB41'),
        lamports: new BigNumber(amountIn.multipliedBy(0.05).toFixed(0)).toNumber(), // 5_000 || 6_000
    });


    let bHash = await connection.getLatestBlockhash().then((blockhash) => blockhash.blockhash);
    innerTransactions[0].instructions.push(mvxFeeInx);

    let tx = new TransactionMessage({
        payerKey: userWallet.publicKey,
        instructions: innerTransactions[0].instructions,
        recentBlockhash: bHash
    }).compileToV0Message();

    let txV = new VersionedTransaction(tx);
    let simulationResult: any;
    let count = 0;
    let sim = true;
    let diff = new BigNumber(poolStartTime).minus(new BigNumber(new Date().getTime()));

    const simulateTransaction = async () => {
        let txSign: any;
        while (sim) {
            simulationResult = await connection.simulateTransaction(txV, { replaceRecentBlockhash: true, commitment: 'confirmed' });
            console.log('sim:', simulationResult, count++);
            if (simulationResult.value.err == null) {
                sim = false;
                setTimeout(() => {
                    buildAndSendTx(userWallet, innerTransactions, { preflightCommitment: 'processed' })
                        .then(async (txids) => {
                            let msg = `🟢 SNIPE <a href="https://solscan.io/tx/${txids[0]}">transaction</a> sent.`
                            await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
                            txSign = txids[0];
                            const isConfirmed = await waitForConfirmation(txids[0]);

                            if (isConfirmed) {
                                const txxs = await connection.getParsedTransaction(txids[0], { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
                                const txAmount = JSON.parse(JSON.stringify(txxs!.meta!.innerInstructions![0].instructions));
                                let extractAmount;
                                if (Array.isArray(txAmount)) {
                                    txAmount.forEach((tx) => {
                                        if (tx.parsed.info.authority === '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1') {
                                            extractAmount = tx.parsed.info.amount;
                                        }
                                    });
                                }
                                let confirmedMsg;
                                let solAmount;
                                let tokenAmount;
                                const _symbol = tokenData.symbol;

                                if (extractAmount) {
                                    solAmount = Number(extractAmount) / 1e9; // Convert amount to SOL
                                    tokenAmount = amountIn.div(Math.pow(10, tokenData.decimals));
                                    confirmedMsg = `✅ <b>Snipe Tx Confirmed:</b> You sniped ${solAmount.toFixed(3)} <b>${_symbol}</b>. <a href="https://solscan.io/tx/${txids[0]}">View Details</a>.`;
                                    await ctx.api.sendMessage(chatId, confirmedMsg, { parse_mode: 'HTML', disable_web_page_preview: true });

                                    saveUserPosition(
                                        userWallet.publicKey.toString(), {
                                        baseMint: poolKeys.baseMint,
                                        symbol: tokenData.symbol,
                                        tradeType: `ray_swap_buy`,
                                        amountIn: amountIn.toNumber(),
                                        amountOut: amountOut.toNumber()
                                    });
                                }
                            }

                            return txSign
                        }).catch(async (error: any) => {
                            let msg = `🔴 SNIPE busy Network, try again.`;
                            await ctx.api.sendMessage(chatId, msg); console.info('error', error);
                            return error;
                        });
                }, diff.toNumber());
            }
        }
    };

    Promise.race([simulateTransaction()]).then((result) => {
        console.log("Promise.race result", result);
    }).catch((error) => {
        console.log("Promise race error", error);
    });

}

// const getPoolSchedule = async (ctx: any, poolKeys: any) => {
//     const poolSchedule = await getPoolScheduleFromHistory(poolKeys.id.toBase58());
//     const nowMilli = new BigNumber(Number(new Date().getTime()));
//     const chatId = ctx.chat.id;

//     let diff: BigNumber = new BigNumber(0);
//     if (poolSchedule) {
//         const launchSchedule = new BigNumber(poolSchedule.open_time * 1000);
//         diff = launchSchedule.minus(nowMilli);
//         if (diff.gt(0)) {
//             ctx.bot.sendMessage(chatId, `Pool opening in ${formatLaunchCountDown(diff.toNumber())}`);
//             console.log("Pool opening in", launchSchedule.toNumber(), "seconds...");
//             return diff;
//         }
//     }
// };

async function sleep(ms: any) {
    console.log("Sleeping for", ms.div(1000).toNumber());
    return new Promise(resolve => setTimeout(resolve, ms));
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
async function _swap({ userWallet, mode, poolKeys, tokenIn, tokenInDecimals, tokenOut, tokenOutDecimals, amountIn, amountOut }: {
    userWallet: Keypair, mode: 'in' | 'out', poolKeys: LiquidityPoolKeys, tokenIn: PublicKey, tokenInDecimals: number,
    tokenOut: PublicKey, tokenOutDecimals: number, amountIn: BigNumber, amountOut: BigNumber
}): Promise<string[]> {

    const walletTokenAccounts = await _getWalletTokenAccount(connection, userWallet.publicKey);

    // ASSETS
    const _tokenIn: Token = new Token(TOKEN_PROGRAM_ID, tokenIn, tokenInDecimals, '', '');
    const _tokenOut: Token = new Token(TOKEN_PROGRAM_ID, tokenOut, tokenOutDecimals, '', '');

    // AMOUNTS
    const inputTokenAmount = new TokenAmount(_tokenIn, amountIn.toNumber(), true);
    const minOutTokenAmount = new TokenAmount(_tokenOut, amountOut.toNumber(), true);

    const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
        connection: connection,
        poolKeys: poolKeys,
        userKeys: {
            tokenAccounts: walletTokenAccounts,
            owner: userWallet.publicKey,
        },
        amountIn: inputTokenAmount,
        amountOut: minOutTokenAmount,
        fixedSide: mode,
        makeTxVersion: TxVersion.V0,
    });
    return await _buildAndSendTx(userWallet, innerTransactions);
}
async function _buildAndSendTx(keypair: Keypair, innerSimpleV0Transaction: InnerSimpleV0Transaction[], options?: SendOptions) {
    const willSendTx: (VersionedTransaction | Transaction)[] = await buildSimpleTransaction({
        connection: connection,
        makeTxVersion: TxVersion.V0,
        payer: keypair.publicKey,
        innerTransactions: innerSimpleV0Transaction,
        addLookupTableInfo: LOOKUP_TABLE_CACHE,
    });
    return await _sendTx(connection, keypair, willSendTx, options)
}
async function _sendTx(
    connection: Connection,
    payer: Keypair | Signer,
    txs: (VersionedTransaction | Transaction)[],
    options?: SendOptions
): Promise<string[]> {
    const txids: string[] = [];
    for (const iTx of txs) {
        if (iTx instanceof VersionedTransaction) {
            iTx.sign([payer]);
            console.log("Sending VersionedTransaction");
            txids.push(await connection.sendTransaction(iTx, { preflightCommitment: 'processed' }));
        } else {
            console.log("Sending VersionedTransaction");
            txids.push(await connection.sendTransaction(iTx, [payer], { preflightCommitment: 'processed' }));
        }
    }
    return txids;
}
async function _getReservers(_baseVault: PublicKey, _quoteVault: PublicKey): Promise<{ baseTokenVaultSupply: BigNumber, quoteTokenVaultSupply: BigNumber }> {
    const baseVault: any = await connection.getParsedAccountInfo(new PublicKey(_baseVault), "processed");
    const quoteVault: any = await connection.getParsedAccountInfo(new PublicKey(_quoteVault), "processed");
    return {
        baseTokenVaultSupply: new BigNumber(baseVault.value?.data.parsed.info.tokenAmount.amount),
        quoteTokenVaultSupply: new BigNumber(quoteVault.value?.data.parsed.info.tokenAmount.amount)
    }
}
async function _quote({ amountIn, baseVault, quoteVault }: { amountIn: BigNumber, baseVault: PublicKey, quoteVault: PublicKey }): Promise<BigNumber> {
    let { baseTokenVaultSupply, quoteTokenVaultSupply } = await _getReservers(baseVault, quoteVault);
    // base SOL & quote SHIT
    const price: BigNumber = quoteTokenVaultSupply.div(baseTokenVaultSupply);
    console.log("******************** **********************");
    log("price ", price.toNumber());
    console.log("******************** **********************");
    log("Base Vault Supply ", baseTokenVaultSupply.toNumber());
    log("Quote Vault Supply ", quoteTokenVaultSupply.toNumber());
    console.log("******************** **********************");
    console.log("******************** **********************");
    return new BigNumber(amountIn.multipliedBy(price))//.div(10 ** quoteDecimals).toFixed(0)) // first swap amount out
}
function getLaunchCountDown(startTime: number): number {
    const launchSchedule: number = Number((new Date().getTime() / 1000).toFixed(0)) - Number(startTime * 1000);
    if (launchSchedule > 0) {
        return launchSchedule
    }
    return 0;
}
export function formatLaunchCountDown(launchSchedule: number): string {
    let seconds: any = Math.floor(launchSchedule / 1000);
    let hours = Math.floor(seconds / 3600);
    seconds = seconds % 3600;
    let minutes: any = Math.floor(seconds / 60);
    seconds = seconds % 60;

    // Pad the minutes and seconds with leading zeros, if required
    hours = +hours;
    minutes = ('0' + minutes).slice(-2);
    seconds = ('0' + seconds).slice(-2);

    // Return the time string
    return `${hours}:${minutes}:${seconds}`;
}
async function getPoolKeysRPC(baseMint: PublicKey) {
    const AMMV4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
    const commitment = "confirmed"
    // 'memcmp:{base:',LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint"),
    // 'memcmp:{quote:',LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint")
    const accounts = await connection.getProgramAccounts(
        AMMV4,
        {
            commitment,
            filters: [
                { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
                {
                    memcmp: {
                        offset: 400,
                        bytes: baseMint.toBase58(),
                    },
                },
                {
                    memcmp: {
                        offset: 432,
                        bytes: 'So11111111111111111111111111111111111111112'
                    },
                },
            ],
        }
    );

    return accounts.map(({ pubkey, account }) => ({
        id: pubkey.toString(),
        ...LIQUIDITY_STATE_LAYOUT_V4.decode(account.data),
    }));
}
