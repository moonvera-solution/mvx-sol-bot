import Client, { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import BigNumber from 'bignumber.js';
import {
    MARKET_STATE_LAYOUT_V3, Liquidity, TokenAmount, LiquidityPoolKeys, Token, SPL_ACCOUNT_LAYOUT, InnerSimpleV0Transaction,
    LiquidityPoolKeysV4, TOKEN_PROGRAM_ID, TokenAccount, Market, SPL_MINT_LAYOUT, TxVersion, buildSimpleTransaction, LOOKUP_TABLE_CACHE,
    LIQUIDITY_STATE_LAYOUT_V4, jsonInfo2PoolKeys
} from "@raydium-io/raydium-sdk";
import { Connection, PublicKey, Keypair, SendOptions, SystemProgram, Signer, Transaction, VersionedTransaction, RpcResponseAndContext, TransactionMessage, SimulatedTransactionResponse, ComputeBudgetProgram } from "@solana/web3.js";
import { getPoolKeys } from "../../../../src/service/dex/raydium/market-data/PoolsFilter";
import { connection, MVXBOT_FEES, TIP_VALIDATOR, WALLET_MVX, SNIPE_SIMULATION_COUNT_LIMIT } from "../../../../config";
import { buildAndSendTx } from '../../util';
import { saveUserPosition } from '../positions';
import { amount, token } from "@metaplex-foundation/js";
const log = (k: any, v: any) => console.log(k, v);
import base58 from 'bs58';
import { getRayPoolKeys, getPoolScheduleFromHistory } from "../../dex/raydium/market-data/1_Geyser";
import { getTokenMetadata } from "../../feeds";
import { waitForConfirmation, getSolBalance } from '../../util';
import { Referrals, UserPositions } from "../../../db/mongo/schema";
import { getMaxPrioritizationFeeByPercentile, getSimulationUnits } from "../../../service/fees/priorityFees";

export async function snipperON(ctx: any, amount: string) {
    let snipeToken = ctx.session.snipeToken instanceof String ? ctx.session.snipeToken : ctx.session.snipeToken.toBase58();
    ctx.session.snipeStatus = true;
    const currentWallet = ctx.session.portfolio.wallets[ctx.session.activeWalletIndex];

    const balanceInSOL = await getSolBalance(currentWallet.publicKey);
    if (balanceInSOL * 1e9 < new BigNumber(amount).toNumber() * 1e9) {
        await ctx.api.sendMessage(ctx.chat.id, '🔴 Insufficient balance for snipe transaction.',{ parse_mode: 'HTML', disable_web_page_preview: true });
        return;
    }

    await ctx.api.sendMessage(ctx.chat.id, `▄︻デ══━一 Snipper set for ${amount} SOL, on ${snipeToken}`,
        {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Cancel Snipe ', callback_data: 'cancel_snipe' }],
                ]
            },
        });

    let poolKeys = await getRayPoolKeys(snipeToken);
    while (!poolKeys && ctx.session.snipeStatus) {
        console.log('Snipe lookup on.');
        poolKeys = await getRayPoolKeys(snipeToken);
    }

    console.log('Snipe lookup end, keys found.');
    poolKeys && ctx.session.snipeStatus && await setSnipe(ctx, amount);
}

export async function setSnipe(ctx: any, amountIn: any) {

    // Returns either the time to wait or indicates pool is already open
    console.log('Snipe set ...');
    const snipeToken = new PublicKey(ctx.session.activeTradingPool.baseMint);
    const rayPoolKeys = await getRayPoolKeys(snipeToken.toBase58());

    const poolKeys = jsonInfo2PoolKeys(rayPoolKeys) as LiquidityPoolKeys;
    let liqInfo = await Liquidity.fetchInfo({ connection, poolKeys });
    // console.log('liqInfo', liqInfo);
    // console.log('liqInfo', liqInfo.startTime.toNumber());
    const amountInLamports = new BigNumber(Number.parseFloat(amountIn)).times(1e9);
    const snipeSlippage = ctx.session.latestSlippage;
    const currentWalletIdx = ctx.session.activeWalletIndex;
    const currentWallet = ctx.session.portfolio.wallets[currentWalletIdx];
    const { tokenData } = await getTokenMetadata(ctx, snipeToken.toBase58());

    const userKeypair = await Keypair.fromSecretKey(base58.decode(String(currentWallet.secretKey)));
    ctx.session.snipeStatus = true;

    const balanceInSOL = await getSolBalance(currentWallet.publicKey);
    if (balanceInSOL * 1e9 < amountInLamports.toNumber()) await ctx.api.sendMessage(
        ctx.portfolio.chatId, '🔴 Insufficient balance for transaction.',
        { parse_mode: 'HTML', disable_web_page_preview: true }
    );

    await ctx.api.sendMessage(ctx.chat.id, `Setting sniper.`);

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
    console.log('amountOut_with_slippage', amountOut_with_slippage);
    console.log('snipeSlippage', snipeSlippage);
    const inputTokenAmount = new TokenAmount(_tokenIn, amountIn.toFixed(0), true);
    const minOutTokenAmount = new TokenAmount(_tokenOut, amountOut_with_slippage.toFixed(0), true);
    const computeBudgetUnits = ctx.session.priorityFees.units;
    const computeBudgetMicroLamports = ctx.session.priorityFees.microLamports;
    const totalComputeBudget = computeBudgetMicroLamports * (computeBudgetUnits / 1e6);
    // console.log('totalComputeBudget', totalComputeBudget);
    // ------- check user balanace in DB --------
    const userPosition = await UserPositions.findOne({ positionChatId: chatId, walletId: userWallet.publicKey.toString() });
    console.log('userPosition', userPosition);
    let oldPositionSol: number = 0;
    let oldPositionToken: number = 0;
    if (userPosition) {
        const existingPositionIndex = userPosition.positions.findIndex(
            position => position.baseMint === _tokenOut.toString()
        );
        if (userPosition.positions[existingPositionIndex]) {
            oldPositionSol = userPosition?.positions[existingPositionIndex].amountIn
            oldPositionToken = userPosition?.positions[existingPositionIndex].amountOut!
        }
    }

    //-------------- Update Earnings referal on Db ----------------
    const referralRecord = await Referrals.findOne({ referredUsers: chatId });
    let actualEarnings = referralRecord?.earnings;
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
        // computeBudgetConfig: {
        //     units: ctx.session.priorityFees.units,
        //     microLamports: ctx.session.priorityFees.microLamports
        // }
    });
    //0.005  0.01 0.05 0.1 0.2
    //low   medium high very high extreme
    //MVXBOT_FEES
    //mvxFeeInx is the amount of fees to be paid to the bot, it is calculated as a percentage of the amountIn
    // we need to calculate the referral fee and send it to the referral wallet
    //the fees sent to the referral wallet is calculated as a percentage of the mvxFeeInx
    //referralFee
    const referralWallet = ctx.session.generatorWallet;
    const referralFee = ctx.session.referralCommision / 100;

    const bot_fee = new BigNumber(amountIn.multipliedBy(MVXBOT_FEES).toFixed(0)).toNumber();
    const referralAmmount = new BigNumber(bot_fee * (referralFee)).toNumber();
    const cut_bot_fee = (bot_fee - referralAmmount);

    let mvxFeeInx: any = null;
    let referralInx: any = null;
    let minimumBalanceNeeded = 0;
    minimumBalanceNeeded += amountIn.toNumber()
    // Tippimg the validator
    // const validatorLead = await connection.getSlotLeader();

    // const transferIx = SystemProgram.transfer({
    //     fromPubkey: userWallet.publicKey,
    //     toPubkey: new PublicKey(validatorLead),
    //     lamports: TIP_VALIDATOR, // 5_000 || 6_000
    // });

    // innerTransactions[0].instructions.push(transferIx);
    // minimumBalanceNeeded += TIP_VALIDATOR;

    if (referralFee > 0) {
        mvxFeeInx = SystemProgram.transfer({
            fromPubkey: userWallet.publicKey,
            toPubkey: new PublicKey(WALLET_MVX),
            lamports: cut_bot_fee,
        });
        referralInx = SystemProgram.transfer({
            fromPubkey: userWallet.publicKey,
            toPubkey: new PublicKey(referralWallet),
            lamports: referralAmmount,
        });

        innerTransactions[0].instructions.push(mvxFeeInx);
        innerTransactions[0].instructions.push(referralInx);
        minimumBalanceNeeded += cut_bot_fee + referralAmmount;
    } else {
        mvxFeeInx = SystemProgram.transfer({
            fromPubkey: userWallet.publicKey,
            toPubkey: new PublicKey(WALLET_MVX),
            lamports: bot_fee, // 5_000 || 6_000
        });
        innerTransactions[0].instructions.push(mvxFeeInx);
        minimumBalanceNeeded += bot_fee;
    }


    const userSolBalance = await getSolBalance(userWallet.publicKey);
    // console.log('userSolBalance', userSolBalance);
    minimumBalanceNeeded += totalComputeBudget;
    // console.log('minimumBalanceNeeded', minimumBalanceNeeded);

    if ((userSolBalance * 1e9) < minimumBalanceNeeded) {
        await ctx.api.sendMessage(chatId, `🔴 Insufficient balance for Turbo Snipping. Your balance is ${userSolBalance} SOL.`);
        return;
    }
    // console.log('maxPriorityFee', ctx.session.priorityFee);
    const maxPriorityFee = await getMaxPrioritizationFeeByPercentile(connection, {
        lockedWritableAccounts: [
            new PublicKey(poolKeys.id.toBase58()),
        ], percentile: ctx.session.priorityFee, //PriotitizationFeeLevels.LOW,
        fallback: true
    });
    const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: maxPriorityFee, });
    //      // Simulate the transaction and add the compute unit limit instruction to your transaction
    let [Units, recentBlockhash] = await Promise.all([
        getSimulationUnits(connection, innerTransactions[0].instructions, userWallet.publicKey),
        connection.getLatestBlockhash(),
    ]);

    if (Units) {
        console.log("units: ", Units);
        Units = Math.ceil(Units * 2); // margin of error
        innerTransactions[0].instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: Units }));
    }

    console.log("maxPriorityFee", maxPriorityFee);
    innerTransactions[0].instructions.push(priorityFeeInstruction);

    let tx = new TransactionMessage({
        payerKey: userWallet.publicKey,
        instructions: innerTransactions[0].instructions,
        recentBlockhash: await connection.getLatestBlockhash().then((blockhash) => blockhash.blockhash)
    }).compileToV0Message();

    let txV = new VersionedTransaction(tx);
    let simulationResult: any;
    let count = 0;
    let sim = true;
    let diff_1 = new BigNumber(poolStartTime).minus(new BigNumber(new Date().getTime()));
    let diff = diff_1.plus(400);

    const simulateTransaction = async () => {
        let txSign: any;
        let snipeStatus: boolean = ctx.session.snipeStatus;
        while (sim && snipeStatus && count < SNIPE_SIMULATION_COUNT_LIMIT) {
            count++
            snipeStatus = ctx.session.snipeStatus;
            simulationResult = await connection.simulateTransaction(txV, { replaceRecentBlockhash: true, commitment: 'processed' });
            const SLIPPAGE_ERROR = /Error: exceeds desired slippage limit/;
            if (simulationResult.value.logs.find((logMsg: any) => SLIPPAGE_ERROR.test(logMsg))) {
                console.log(simulationResult.value.logs)
                ctx.api.sendMessage(ctx.chat.id, `🔴 Slippage error, try increasing your slippage %.`);
                return;
            }
            const BALANCE_ERROR = /Transfer: insufficient lamports/;
            if (simulationResult.value.logs.find((logMsg: any) => BALANCE_ERROR.test(logMsg))) {
                console.log(simulationResult.value.logs)
                ctx.api.sendMessage(ctx.chat.id, `🔴 Insufficient balance for transaction.`);
                return;
            }

            console.log('sim:', simulationResult, count);

            if (simulationResult.value.err == null) {
                sim = false;
                await ctx.api.sendMessage(ctx.chat.id, `▄︻デ══━一   ${amountIn} $${tokenData.symbol} Snipe set.`,
                    {
                        parse_mode: 'HTML',
                        disable_web_page_preview: true,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: 'Cancel Snipe ', callback_data: 'cancel_snipe' }],
                            ]
                        },
                    });
                setTimeout(() => {
                    buildAndSendTx(userWallet, innerTransactions, { preflightCommitment: 'processed' })
                        .then(async (txids) => {
                            let msg = `🟢 Snipe <a href="https://solscan.io/tx/${txids[0]}">transaction</a> sent.`
                            await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
                            txSign = txids[0];
                            const isConfirmed = await waitForConfirmation(txids[0]);

                            if (isConfirmed) {
                                // console.log('isConfirmed', isConfirmed);
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
                                        ctx,
                                        userWallet.publicKey.toString(), {
                                        baseMint: poolKeys.baseMint,
                                        name: tokenData.name,
                                        symbol: tokenData.symbol,
                                        tradeType: `ray_swap_buy`,
                                        amountIn: oldPositionSol ? oldPositionSol + amountIn.toNumber() : amountIn.toNumber(),
                                        amountOut: oldPositionToken ? oldPositionToken + Number(extractAmount) : Number(extractAmount)
                                    });


                                    if (referralFee > 0) {
                                        if (referralRecord) {
                                            let updateEarnings = actualEarnings! + referralAmmount;
                                            referralRecord.earnings = Number(updateEarnings.toFixed(0));
                                            await referralRecord?.save();
                                        }
                                    }
                                }
                            }
                            return txSign
                        }).catch(async (error: any) => {
                            let msg = `🔴 Snipe fail, busy Network, try again.`;
                            await ctx.api.sendMessage(chatId, msg); console.info('error', error);
                            return error;
                        });
                }, diff.toNumber());
            }
        }

        if (count == SNIPE_SIMULATION_COUNT_LIMIT) {
            await ctx.api.sendMessage(chatId, `🔴 Snipe fail, busy Network, try again.`);
            console.info('error');
            return;
        }
    }

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
