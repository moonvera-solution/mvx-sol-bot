import { logErrorToFile } from '../../../../error/logger';
import BigNumber from 'bignumber.js';
import {
    Liquidity, TokenAmount, LiquidityPoolKeys, Token, SPL_ACCOUNT_LAYOUT,
    TOKEN_PROGRAM_ID, TokenAccount, TxVersion, jsonInfo2PoolKeys
} from "@raydium-io/raydium-sdk";
import { Connection, PublicKey, Keypair, SystemProgram, VersionedTransaction, TransactionMessage, ComputeBudgetProgram } from "@solana/web3.js";
import { MVXBOT_FEES, WALLET_MVX, SNIPE_SIMULATION_COUNT_LIMIT, RAYDIUM_AUTHORITY } from "../../../../config";
import { buildAndSendTx, trackUntilFinalized, getPriorityFeeLabel } from '../../util';
import { saveUserPosition } from '../positions';
const log = (k: any, v: any) => console.log(k, v);
import base58 from 'bs58';
import { getRayPoolKeys } from "../../dex/raydium/raydium-utils/formatAmmKeysById";
import { getTokenMetadata } from "../../feeds";
import { waitForConfirmation, getSolBalance, getTokenExplorerURLS } from '../../util';
import { Referrals, UserPositions } from "../../../db/mongo/schema";
import { getMaxPrioritizationFeeByPercentile, getSimulationUnits } from "../../../service/fees/priorityFees";

export async function snipperON(ctx: any, amount: string) {
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);
    let snipeToken = ctx.session.snipeToken instanceof String ? ctx.session.snipeToken : ctx.session.snipeToken.toBase58();
    ctx.session.snipeStatus = true;
    const currentWallet = ctx.session.portfolio.wallets[ctx.session.activeWalletIndex];

    const balanceInSOL = await getSolBalance(currentWallet.publicKey, connection);
    if (balanceInSOL * 1e9 < new BigNumber(amount).toNumber() * 1e9) {
        await ctx.api.sendMessage(ctx.chat.id, '🔴 Insufficient balance for snipe transaction.', { parse_mode: 'HTML', disable_web_page_preview: true });
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

    let poolKeys = await getRayPoolKeys(ctx, snipeToken);
    while (!poolKeys && ctx.session.snipeStatus && poolKeys === null) {
        console.log('Snipe lookup on.');
        poolKeys = await getRayPoolKeys(ctx, snipeToken);
    }
    ctx.session.activeTradingPool = poolKeys;
    console.log('Snipe lookup end, keys found.');
    poolKeys && ctx.session.snipeStatus && await setSnipe(ctx, amount);
}

export async function setSnipe(ctx: any, amountIn: any) {
    // Returns either the time to wait or indicates pool is already open
    console.log('Snipe set ...');
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);
    const snipeToken = new PublicKey(ctx.session.activeTradingPool.baseMint);
    const rayPoolKeys = await getRayPoolKeys(ctx, snipeToken.toBase58());

    const poolKeys = jsonInfo2PoolKeys(rayPoolKeys) as LiquidityPoolKeys;
    let liqInfo = await Liquidity.fetchInfo({ connection, poolKeys });
    // console.log('liqInfo', liqInfo);
    // console.log('liqInfo', liqInfo.startTime.toNumber());
    const amountInLamports = new BigNumber(Number.parseFloat(amountIn)).times(1e9);
    const snipeSlippage = ctx.session.snipeSlippage;
    console.log('snipeSlippage', snipeSlippage);
    const currentWalletIdx = ctx.session.activeWalletIndex;
    const currentWallet = ctx.session.portfolio.wallets[currentWalletIdx];
    const { tokenData } = await getTokenMetadata(ctx, snipeToken.toBase58());

    const userKeypair = await Keypair.fromSecretKey(base58.decode(String(currentWallet.secretKey)));
    ctx.session.snipeStatus = true;

    const balanceInSOL = await getSolBalance(currentWallet.publicKey, connection);
    if (balanceInSOL * 1e9 < amountInLamports.toNumber()) await ctx.api.sendMessage(
        ctx.portfolio.chatId, '🔴 Insufficient balance for transaction.',
        { parse_mode: 'HTML', disable_web_page_preview: true }
    );

    // await ctx.api.sendMessage(ctx.chat.id, `Setting sniper.`);

    // Start the simulation without waiting for it to complete
    const poolStartTime = liqInfo.startTime.toNumber();
    const simulationPromise = startSnippeSimulation(ctx, poolKeys, userKeypair, amountInLamports, snipeSlippage, poolStartTime, tokenData);
    simulationPromise.catch(async (error: any) => {
        console.log("Error setting snipper", error);
        await ctx.api.sendMessage(ctx.chat.id, `🔴 Snipe fail: ${error}`);
        logErrorToFile("bot on snipe simmulation", error);
    });
    await simulationPromise;
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
    const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);
    const walletTokenAccounts = await _getWalletTokenAccount(connection, userWallet.publicKey);
    const _tokenIn: Token = new Token(TOKEN_PROGRAM_ID, poolKeys.quoteMint, poolKeys.quoteDecimals, '', '');
    const _tokenOut: Token = new Token(TOKEN_PROGRAM_ID, poolKeys.baseMint, poolKeys.baseDecimals, '', '');

    const amountOut = await _quote({ amountIn: amountIn, baseVault: poolKeys.quoteVault, quoteVault: poolKeys.baseVault, connection });
    const amountOut_with_slippage = new BigNumber(amountOut.minus(amountOut.times(snipeSlippage).div(100)).toFixed(0));
    console.log('amountOut_with_slippage', amountOut_with_slippage);
    // console.log('snipeSlippage', snipeSlippage);
    const inputTokenAmount = new TokenAmount(_tokenIn, amountIn.toFixed(0), true);
    const minOutTokenAmount = new TokenAmount(_tokenOut, amountOut_with_slippage.toFixed(0), true);
    const computeBudgetUnits = ctx.session.priorityFees.units;
    const computeBudgetMicroLamports = ctx.session.priorityFees.microLamports;
    const totalComputeBudget = computeBudgetMicroLamports * (computeBudgetUnits / 1e6);
    // console.log('totalComputeBudget', totalComputeBudget);
    // ------- check user balanace in DB --------
    const userPosition = await UserPositions.findOne({ positionChatId: chatId, walletId: userWallet.publicKey.toString() });
    //   console.log('userPosition', userPosition);
    // console.log('_tokenOut', _tokenOut.mint.toBase58());
    let oldPositionSol: number = 0;
    let oldPositionToken: number = 0;
    if (userPosition) {
        const existingPositionIndex = userPosition.positions.findIndex(
            position => position.baseMint === _tokenOut.mint.toBase58()
        );
        // console.log('existingPositionIndex', existingPositionIndex);
        if (userPosition.positions[existingPositionIndex]) {
            oldPositionSol = userPosition?.positions[existingPositionIndex].amountIn
            oldPositionToken = userPosition?.positions[existingPositionIndex].amountOut!
        }
    }

    //-------------- Update Earnings referal on Db ----------------
    const referralRecord = await Referrals.findOne({ referredUsers: chatId });
    let actualEarnings = referralRecord && referralRecord.earnings;
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


    const userSolBalance = await getSolBalance(userWallet.publicKey, connection);
    // console.log('userSolBalance', userSolBalance);
    minimumBalanceNeeded += totalComputeBudget;
    // console.log('minimumBalanceNeeded', minimumBalanceNeeded);

    if ((userSolBalance * 1e9) < minimumBalanceNeeded) {
        await ctx.api.sendMessage(chatId, `🔴 Insufficient balance for Turbo Snipping. Your balance is ${userSolBalance} SOL.`);
        return;
    }
    let maxPriorityFee;
    const raydiumId = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8')
    if (poolKeys) {
        maxPriorityFee = await getMaxPrioritizationFeeByPercentile(connection, {
            lockedWritableAccounts: [
                new PublicKey(poolKeys.id.toBase58()),
            ], percentile: ctx.session.priorityFee, //PriotitizationFeeLevels.LOW,
            fallback: true
        });
    } else {
        maxPriorityFee = await getMaxPrioritizationFeeByPercentile(connection, {
            lockedWritableAccounts: [
                new PublicKey(raydiumId.toBase58()),
            ], percentile: ctx.session.priorityFee, //PriotitizationFeeLevels.LOW,
            fallback: true
        });
    }

    const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: maxPriorityFee, });
    //      // Simulate the transaction and add the compute unit limit instruction to your transaction
    let [Units, recentBlockhash] = await Promise.all([
        getSimulationUnits(connection, innerTransactions[0].instructions, userWallet.publicKey),
        connection.getLatestBlockhash(),
    ]);

    if (Units) {
        console.log("units: ", Units);
        Units = Math.ceil(Units * 2); // margin of error
        console.log("Units", Units);
        innerTransactions[0].instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: Units }));
    }
    console.log("maxPriorityFee", maxPriorityFee);

    innerTransactions[0].instructions.push(priorityFeeInstruction);

    let tx = new TransactionMessage({
        payerKey: userWallet.publicKey,
        instructions: innerTransactions[0].instructions,
        recentBlockhash: await connection.getLatestBlockhash().then((blockhash: any) => blockhash.blockhash)
    }).compileToV0Message();

    let txV = new VersionedTransaction(tx);
    let simulationResult: any;
    let count = 0;
    let sim = true;
    let diff_1 = new BigNumber(poolStartTime).minus(new BigNumber(new Date().getTime()));
    let diff = diff_1.plus(400);


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
        const FEES_ERROR = 'InsufficientFundsForFee';
        if (simulationResult.value.err === FEES_ERROR) {
            console.log(simulationResult.value.logs)
            ctx.api.sendMessage(ctx.chat.id, `🔴 Insufficient balance for transaction fees.`);
            return;
        }

        console.log('sim:', simulationResult, count);

        if (simulationResult.value.err == null) {
            sim = false;
            await ctx.api.sendMessage(ctx.chat.id, `▄︻デ══━一 $${tokenData.symbol} with ${amountIn.dividedBy(1e9)} SOL.`);
                // {
                //     parse_mode: 'HTML',
                //     disable_web_page_preview: true,
                //     reply_markup: {
                //         inline_keyboard: [
                //             [{ text: 'Cancel Snipe ', callback_data: 'cancel_snipe' }],
                //         ]
                //     },
                // });
            setTimeout(() => {
                buildAndSendTx(userWallet, innerTransactions, connection, { preflightCommitment: 'processed' }).then(async (txids: any) => {

                    let msg = `🟢 Snipe <a href="https://solscan.io/tx/${txids[0]}">transaction</a> sent. Please wait for confirmation...`
                    await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
                    let extractAmountCounter: number = 0;
                    let extractAmount: number = 0;
                    if (await waitForConfirmation(ctx, txids[0])) {

                        while (extractAmount == 0 && extractAmountCounter < 11) { // it has to find it since its a transfer tx
                            extractAmountCounter++;
                            console.log("extractAmountCounter", extractAmountCounter);

                            const txxs = await connection.getParsedTransaction(txids[0], { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
                            let txAmount: Array<any> | undefined;

                            if (txxs && txxs.meta && txxs.meta.innerInstructions && txxs.meta.innerInstructions[0].instructions) {
                                txAmount = JSON.parse(JSON.stringify(txxs.meta.innerInstructions[0].instructions));
                                txAmount = !Array.isArray(txAmount) ? [txAmount] : txAmount;
                                txAmount.forEach((tx) => {
                                    if (tx.parsed.info.authority == RAYDIUM_AUTHORITY) { extractAmount = tx.parsed.info.amount; }
                                    console.log('inner tx: ', JSON.parse(JSON.stringify(tx)));
                                });
                            }
                        }

                        let solAmount, tokenAmount, _symbol = tokenData.symbol;

                        if (extractAmount > 0) {
                            console.log('extractAmount', extractAmount);
                            solAmount = Number(extractAmount) / 1e9; // Convert amount to SOL
                            tokenAmount = amountIn.div(Math.pow(10, tokenData.decimals));
                            await ctx.api.sendMessage(chatId,
                                `✅ <b>Snipe Tx Confirmed:</b> You sniped ${solAmount.toFixed(3)} <b>${_symbol}</b>. <a href="https://solscan.io/tx/${txids[0]}">View Details</a>.`,
                                { parse_mode: 'HTML', disable_web_page_preview: true });
                        } else {
                            ctx.api.sendMessage(chatId, '✅ Snipe Tx Confirmed');;
                        }

                        if (referralFee > 0) {
                            if (referralRecord) {
                                let updateEarnings = actualEarnings && actualEarnings + referralAmmount;
                                referralRecord.earnings = Number(updateEarnings && updateEarnings.toFixed(0));
                                await referralRecord.save();
                            }
                        }

                        if (await trackUntilFinalized(ctx, txids[0])) {
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
                        }
                    } else {  // Tx not confirmed
                        const priorityFeeLabel = getPriorityFeeLabel(ctx.session.priorityFees);
                        const checkLiquidityMsg = priorityFeeLabel 
                        ctx.api.sendMessage(ctx.chat.id,
                            `Transaction could not be confirmed within the ${priorityFeeLabel.toUpperCase()} priority fee. \n` + checkLiquidityMsg
                        );
                    }
                }).catch(async (error: any) => {
                    let msg = `🔴 Snipe fail, busy Network, try again.`;
                    await ctx.api.sendMessage(chatId, msg); console.info('error', error);
                    return error;
                });
            }, diff.toNumber());
        }
    }

    if (count == SNIPE_SIMULATION_COUNT_LIMIT) {
        await ctx.api.sendMessage(chatId, `🔴 Snipe fail, busy Network, please try again.`);
        console.info('error');
        return;
    }
}

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

async function _getReservers(_baseVault: PublicKey, _quoteVault: PublicKey, connection: Connection): Promise<{ baseTokenVaultSupply: BigNumber, quoteTokenVaultSupply: BigNumber }> {
    const baseVault: any = await connection.getParsedAccountInfo(new PublicKey(_baseVault), "processed");
    const quoteVault: any = await connection.getParsedAccountInfo(new PublicKey(_quoteVault), "processed");
    return {
        baseTokenVaultSupply: new BigNumber(baseVault.value?.data.parsed.info.tokenAmount.amount),
        quoteTokenVaultSupply: new BigNumber(quoteVault.value?.data.parsed.info.tokenAmount.amount)
    }
}
async function _quote({ amountIn, baseVault, quoteVault, connection }: { amountIn: BigNumber, baseVault: PublicKey, quoteVault: PublicKey, connection: Connection }): Promise<BigNumber> {
    let { baseTokenVaultSupply, quoteTokenVaultSupply } = await _getReservers(baseVault, quoteVault, connection);
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
// async function getPoolKeysRPC(baseMint: PublicKey) {
//     const AMMV4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
//     const commitment = "confirmed"
//     // 'memcmp:{base:',LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint"),
//     // 'memcmp:{quote:',LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint")
//     const accounts = await connection.getProgramAccounts(
//         AMMV4,
//         {
//             commitment,
//             filters: [
//                 { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
//                 {
//                     memcmp: {
//                         offset: 400,
//                         bytes: baseMint.toBase58(),
//                     },
//                 },
//                 {
//                     memcmp: {
//                         offset: 432,
//                         bytes: 'So11111111111111111111111111111111111111112'
//                     },
//                 },
//             ],
//         }
//     );

//     return accounts.map(({ pubkey, account }: { pubkey: any, account: any }) => ({
//         id: pubkey.toString(),
//         ...LIQUIDITY_STATE_LAYOUT_V4.decode(account.data),
//     }));
// }
