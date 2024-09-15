import BigNumber from 'bignumber.js';
import {
    Liquidity, TokenAmount, LiquidityPoolKeys, Token, SPL_ACCOUNT_LAYOUT, TOKEN_PROGRAM_ID, TokenAccount, TxVersion, jsonInfo2PoolKeys
} from "@raydium-io/raydium-sdk";
import dotenv from 'dotenv'; dotenv.config();
import { Connection, PublicKey, Keypair, SystemProgram, VersionedTransaction, Transaction, TransactionMessage, ComputeBudgetProgram, AddressLookupTableAccount, sendAndConfirmRawTransaction } from "@solana/web3.js";
import { MVXBOT_FEES, WALLET_MVX, SNIPE_SIMULATION_COUNT_LIMIT, CONNECTION, RAYDIUM_AUTHORITY, SOL_ADDRESS } from "../../../config";
import { buildAndSendTx, getPriorityFeeLabel, getSwapAmountOut, optimizedSendAndConfirmTransaction, wrapLegacyTx, addMvxFeesInx, getSwapAmountOutCpmm } from '../../util';
import { ApiV3PoolInfoStandardItemCpmm, CurveCalculator, CREATE_CPMM_POOL_PROGRAM, DEV_CREATE_CPMM_POOL_PROGRAM, CpmmPoolInfoLayout, CpmmConfigInfoInterface, ApiV3PoolInfoStandardItem } from '@raydium-io/raydium-sdk-v2';
import { saveUserPosition } from '../positions';
const log = (k: any, v: any) => console.log(k, v);
import base58 from 'bs58';
import { getRayPoolKeys, formatAmmKeysById } from "../../dex/raydium/utils/formatAmmKeysById";
import { getTokenMetadata } from "../../feeds";
import {  getSolBalance } from '../../util';
import { Referrals, UserPositions } from "../../../db/mongo/schema";
import { initSdk } from "../../dex/raydium/cpmm";
import { display_jupSwapDetails } from '../../../views/jupiter/swapView';
import BN from 'bn.js'
import bs58 from 'bs58';
// import { getOrCreateATA } from '../../../service/dex/raydium/amm/ammv4';

export async function snipperON(ctx: any, amount: string) {
    try {
        const connection = CONNECTION;
        let snipeToken = ctx.session.snipeToken instanceof PublicKey ? ctx.session.snipeToken.toBase58() : ctx.session.snipeToken;

        const currentWallet = ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex];

        let [balanceInSOL, poolKeys] = await Promise.all([
            getSolBalance(currentWallet.publicKey, connection),
            getRayPoolKeys(ctx, snipeToken)
        ]);
        if (balanceInSOL * 1e9 < new BigNumber(amount).toNumber() * 1e9) {
            console.log(' snipe transaction.');
            await ctx.api.sendMessage(ctx.chat.id, '🔴 Insufficient balance for snipe transaction.', { parse_mode: 'HTML', disable_web_page_preview: true });
            return;
        }

        await ctx.api.sendMessage(ctx.chat.id, `▄︻デ══━一 Snipper set for ${amount} SOL, on ${snipeToken}`, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Cancel Snipe ', callback_data: 'cancel_snipe' }],
                ]
            },
        });

        // let poolKeys = await getRayPoolKeys(ctx, snipeToken);
        let isIntervalDone = false;
        let interval_1: any, interval_2: any;

        interval_1 = setInterval(async () => {
            if (!poolKeys && ctx.session.snipeStatus) {
                console.log('Snipe lookup on.');
                poolKeys = await getRayPoolKeys(ctx, snipeToken);
                // console.log('poolKeysRayyy:::::', poolKeys);
                console.log('snipe status: ', ctx.session.snipeStatus);
            } else if (poolKeys) {

                isIntervalDone = true;
                clearInterval(interval_1); // Stop the interval when the condition is no longer met
                clearInterval(interval_2);
                // console.log('poolKeys:::::', poolKeys.id);
                // ctx.session.activeTradingPool = poolKeys;
                setSnipe(ctx, amount);
            }
            if (!ctx.session.snipeStatus) {
                clearInterval(interval_1); // Stop the interval when the condition is no longer met
                clearInterval(interval_2);
                return;
            }
        }, 300); // Adjust the interval time as needed

        !isIntervalDone && new Promise((resolve: any) => {
            interval_2 = setTimeout(() => {
                clearInterval(interval_1);
                isIntervalDone = true;
                resolve();
            }, 300000); // 5 minutes in milliseconds
        }).then(async () => {
            console.log("isIntervalDone", isIntervalDone);
            console.log('Snipe lookup end, keys not founda after 5 min.');
            return await ctx.api.sendMessage(ctx.chat.id, `🔴 Snipe 5min timeout, please set your snipper.`, { parse_mode: 'HTML', disable_web_page_preview: true });
        });
    } catch (e: any) {
        console.log(e);
        console.log("bot on snipperON", e);
        return await ctx.api.sendMessage(ctx.chat.id, e.message);
    }
}

export async function setSnipe(ctx: any, amountIn: any) {
    // Returns either the time to wait or indicates pool is already open
    console.log('Snipe set ...');
    const isCpmmPool = ctx.session.isCpmmPool;
    const connection = CONNECTION;
    const snipeToken = new PublicKey(ctx.session.snipeToken);

    const amountInLamports = new BigNumber(Number.parseFloat(amountIn)).times(1e9);
    const snipeSlippage = ctx.session.snipeSlippage;

    const currentWalletIdx = ctx.session.portfolio.activeWalletIndex;
    const currentWallet = ctx.session.portfolio.wallets[currentWalletIdx];
    const [balanceInSOL, { tokenData }] = await Promise.all([
        getSolBalance(currentWallet.publicKey, connection),
        getTokenMetadata(ctx, snipeToken.toBase58())
    ]);
    const userKeypair = Keypair.fromSecretKey(base58.decode(String(currentWallet.secretKey)));
    ctx.session.snipeStatus = true;

    if (balanceInSOL * 1e9 < amountInLamports.toNumber()) {
        await ctx.api.sendMessage(ctx.session.portfolio.chatId, '🔴 Insufficient balance for transaction.',
            { parse_mode: 'HTML', disable_web_page_preview: true }
        );
        return;
    }
    // const liqInfo = ctx.session.poolSchedule;
    const poolStartTime = Number(ctx.session.poolTime);
    const simulationPromise = startSnippeSimulation(ctx, userKeypair, amountInLamports, snipeSlippage, poolStartTime, tokenData);
    simulationPromise.catch(async (error: any) => {
        console.log("Error setting snipper", error);
        await ctx.api.sendMessage(ctx.chat.id, `🔴 Snipe fail: ${error}`);
        console.log("bot on snipe simmulation", error);
    });
    await simulationPromise;
}

async function _getCpmmSwapTx(ctx: any, tradeSide: 'buy' | 'sell', poolKeys: any, userWallet: Keypair, amountIn: number): Promise<VersionedTransaction |null > {
    const chatId = ctx.chat.id;
    const connection = CONNECTION;
    // console.log("userWallet --c>", userWallet.publicKey.toBase58());
    const raydium = await initSdk( connection);
    raydium.setOwner(userWallet)

    const poolId = ctx.session.cpmmPoolInfo.id;
console.log("poolId --c>", poolId);
    const [data,rpcData] = await Promise.all([
        raydium.cpmm.getPoolInfoFromRpc(poolId ),
        raydium.cpmm.getRpcPoolInfo(poolId, true)
       ])
    const poolInfo = data.poolInfo;
    rpcData.configInfo!.tradeFeeRate = new BN(0);
    // const buyAddress =  poolInfo.mintA.address === SOL_ADDRESS ? poolInfo.mintA.address : poolInfo.mintB.address;

    const inputMint =  poolInfo.mintA.address === SOL_ADDRESS ? poolInfo.mintA.address : poolInfo.mintB.address;
    const baseIn = inputMint === poolInfo.mintA.address;
    const isValidCpmm = (id: string) => VALID_PROGRAM_ID.has(id);

    const VALID_PROGRAM_ID = new Set([CREATE_CPMM_POOL_PROGRAM.toBase58(), DEV_CREATE_CPMM_POOL_PROGRAM.toBase58()])

    if (!isValidCpmm(poolInfo.programId)) throw new Error('target pool is not CPMM pool');

    let swapResult: any;
    try{
        swapResult = CurveCalculator.swap(
            new BN(amountIn),
            baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
            baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
            rpcData.configInfo!.tradeFeeRate
        );

    } catch (e: any) {
        console.log("swapResult error --c>", e);
        throw new Error(`🔴 Swap failed! Please try again.`);
    }
      
    console.log("swapResult --c>", swapResult);
    poolInfo.config.tradeFeeRate = 0
    poolInfo.feeRate = 0
    if (!poolInfo) throw new Error('Invalid pool information retrieved');


    let { transaction } = await raydium.cpmm.swap({
        poolInfo,
    poolKeys,
    payer: userWallet.publicKey,
    baseIn,
    fixedOut: false,
    slippage: ctx.session.latestSlippage * 100 / 10_000,
    swapResult,
    inputAmount: new BN(0),
    config: {
      checkCreateATAOwner: true,
      associatedOnly: true,
    },
    
    computeBudgetConfig: {
      microLamports: ctx.session.customPriorityFee * 1e9,
      
    }
      });

    const solAmount =  new BigNumber(swapResult.sourceAmountSwapped.toNumber());


    if (transaction instanceof Transaction) {
        // transaction.instructions.push(...addMvxFeesInx(userWallet, solAmount));
        const tx = new VersionedTransaction(wrapLegacyTx(transaction.instructions, userWallet, (await connection.getLatestBlockhash()).blockhash));
        tx.sign([userWallet]);
        // console.log("is Transaction....", tx);
        return tx;
    } else if (transaction instanceof VersionedTransaction) {
        console.log("is VersionedTransaction....");
        const addressLookupTableAccounts = await Promise.all(
            transaction.message.addressTableLookups.map(async (lookup) => {
                return new AddressLookupTableAccount({
                    key: lookup.accountKey,
                    state: AddressLookupTableAccount.deserialize(
                        await connection.getAccountInfo(lookup.accountKey).then((res) => res!.data),
                    ),
                })
            }));
        var message = TransactionMessage.decompile(transaction.message, { addressLookupTableAccounts: addressLookupTableAccounts })
        message.instructions.push(...addMvxFeesInx(userWallet, solAmount));
        const tx = new VersionedTransaction(transaction.message);
        tx.message.recentBlockhash = await connection.getLatestBlockhash().then((blockhash: any) => blockhash.blockhash);
        tx.sign([userWallet]);
        return tx;
    }
    return null;
}

async function _getAmmSwapTx(ctx: any, poolKeys: any, userWallet: Keypair, amountIn: BigNumber): Promise<VersionedTransaction | null> {
    const chatId = ctx.chat.id;
    const snipeSlippage = ctx.session.snipeSlippage * 100 / 10_000;
    console.log("snipeSlippage --c>", snipeSlippage);
    const connection = CONNECTION;
    // const walletTokenAccounts = await _getWalletTokenAccount(connection, userWallet.publicKey);
    // const wallettoUse = Keypair.fromSecretKey(bs58.decode(String(userWallet.secretKey)));
    const raydium = await initSdk( connection)
    raydium.setOwner(userWallet)

    let poolInfo: ApiV3PoolInfoStandardItem   = ctx.session.AmmPoolInfo
    const modifiedPoolInfo = { ...poolInfo };
    if(poolInfo.mintA.address === SOL_ADDRESS){
        modifiedPoolInfo.mintA = poolInfo.mintB;
        modifiedPoolInfo.mintB = poolInfo.mintA;
        modifiedPoolInfo.mintAmountA = poolInfo.mintAmountB;
        modifiedPoolInfo.mintAmountB = poolInfo.mintAmountA;
        // modifiedPoolInfo.feeRate = 0;
      }
    const rpcData =   ctx.session.AmmRpcData
    const [baseReserve, quoteReserve, status] = [rpcData.baseReserve, rpcData.quoteReserve, rpcData.status.toNumber()]
    const mintIn = modifiedPoolInfo.mintB; 
    const mintOut =  modifiedPoolInfo.mintA; 
    const out = raydium.liquidity.computeAmountOut({
        poolInfo: {
          ...modifiedPoolInfo,
          baseReserve,
          quoteReserve,
          status,
          version: 4,
        },
        amountIn: new BN(Number(amountIn)),
        mintIn: mintIn.address,
        mintOut: mintOut.address,
        slippage: (snipeSlippage),
        // range: 1 ~ 0.0001, means 100% ~ 0.01%
  
      })

      const { transaction } = await raydium.liquidity.swap({
        poolInfo,
        poolKeys,
        amountIn: new BN(Number(amountIn)),
        amountOut: out.minAmountOut, 
        inputMint: mintIn.address,   // out.amountOut means amount 'without' slippage
        fixedSide: 'in',
        config: {
            associatedOnly:  true ,
            inputUseSolBalance: true,
            outputUseSolBalance: true,
          }, 
          computeBudgetConfig: {
          microLamports: ctx.session.customPriorityFee * 1e9,
        }
      }).catch((e) => {
        console.log("swap error --c>", e);
        throw new Error(`🔴 Swap failed! Please try again.`);
      });




    let txV: any = ''; 
    let solAmount = new BigNumber(amountIn) 
    if (transaction instanceof Transaction) {
        transaction.instructions.push(...addMvxFeesInx(userWallet, solAmount));
        // addMvxFeesInx(userWallet, solAmount);
        txV = new VersionedTransaction(wrapLegacyTx(transaction.instructions, userWallet, (await connection.getLatestBlockhash()).blockhash));
        txV.sign([userWallet]);
      
      } else if (transaction instanceof VersionedTransaction) {
        console.log("is VersionedTransaction....");
        const addressLookupTableAccounts = await Promise.all(
            transaction.message.addressTableLookups.map(async (lookup) => {
                return new AddressLookupTableAccount({
                    key: lookup.accountKey,
                    state: AddressLookupTableAccount.deserialize(
                        await connection.getAccountInfo(lookup.accountKey).then((res) => res!.data),
                    ),
                })
            }));
        var message = TransactionMessage.decompile(transaction.message, { addressLookupTableAccounts: addressLookupTableAccounts })
        message.instructions.push(...addMvxFeesInx(userWallet, solAmount));
        txV = new VersionedTransaction(transaction.message);
        txV.message.recentBlockhash = await connection.getLatestBlockhash().then((blockhash: any) => blockhash.blockhash);
        txV.sign([userWallet]);
      }

    return txV;
}

export async function startSnippeSimulation(
    ctx: any,
    userWallet: Keypair,
    amountIn: BigNumber,
    snipeSlippage: number,
    poolStartTime: number,
    tokenData: any
) {
    const chatId = ctx.chat.id;
    const connection = CONNECTION;
    const isCpmmPool = ctx.session.isCpmmPool;
    const poolKeys = isCpmmPool == true ? ctx.session.cpmmPoolInfo : ctx.session.AmmPoolKeys;

    let txV: VersionedTransaction | null;
    let token: string;
    if (isCpmmPool) {
            console.log('isCpmmPool here');

        token = poolKeys.mintB.address === SOL_ADDRESS ? poolKeys.mintA.address : poolKeys.mintB.address;
        txV = await _getCpmmSwapTx(ctx, 'buy', poolKeys, userWallet, amountIn.toNumber());
        // console.log('txV', txV);
    } else {
        token = poolKeys.mintA.address === SOL_ADDRESS ? poolKeys.mintB.address : poolKeys.mintA.address;
        txV = await _getAmmSwapTx(ctx, poolKeys, userWallet, amountIn);
    }


    let count = 0;
    let sim: boolean = true;
    let simulationResult: any;
    let diff_1 = new BigNumber(poolStartTime).minus(new BigNumber(new Date().getTime()));
    let diff = diff_1.toNumber() > 0 ? diff_1.plus(400) : diff_1;
    let snipeStatus: boolean = ctx.session.snipeStatus;

    setTimeout(async () => {
        while (sim && snipeStatus && count < SNIPE_SIMULATION_COUNT_LIMIT) {
            count++
            snipeStatus = ctx.session.snipeStatus;
            // console.log('snipeStatus here', snipeStatus);
            simulationResult = await connection.simulateTransaction(txV!, { replaceRecentBlockhash: true, commitment: 'processed' });
            // console.log("simulationResult", simulationResult );
            const BALANCE_ERROR = /Transfer: insufficient lamports/;
            const SLIPPAGE_ERROR = /Error: exceeds desired slippage limit/;
            if (simulationResult.value.logs.find((logMsg: any) => BALANCE_ERROR.test(logMsg))) {
                // console.log(simulationResult.value.logs)
                console.log("SIM EERROR --c>", JSON.parse(JSON.stringify(simulationResult.value)));
                ctx.api.sendMessage(chatId, `🔴 Insufficient balance for transaction.`);
                return;
            } else if (simulationResult.value.logs.find((logMsg: any) => SLIPPAGE_ERROR.test(logMsg))) {
                console.log(simulationResult.value.logs)
                throw new Error(`🔴 Slippage error, try increasing your slippage %.`);
            }
            await catchSimulationErrors(ctx, simulationResult);
         
       
            if (simulationResult.value.err == null) {
                sim = false;
                const txSig = await optimizedSendAndConfirmTransaction(txV!, connection, (await connection.getLatestBlockhash()).blockhash, 50);
                let msg = `🟢 Snipe <a href="https://solscan.io/tx/${txSig}">transaction</a> sent. Please wait for confirmation...`
                await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
                let extractAmount = ctx.session.isCpmmPool == true ? await getSwapAmountOutCpmm(connection, txSig!,'buy') : await getSwapAmountOut(connection, txSig!);
                console.log("extractAmount", extractAmount);
                let solAmount, tokenAmount, _symbol = tokenData.symbol;
                if (extractAmount > 0) {
                    solAmount = Number(extractAmount) / Math.pow(10, Number(tokenData.mint.decimals)); // Convert amount to SOL
                    tokenAmount = amountIn.div(Math.pow(10, tokenData.decimals));
                    await ctx.api.sendMessage(chatId, `✅ <b>Snipe Tx Confirmed:</b> You sniped ${solAmount.toFixed(3)} <b>${_symbol}</b>. <a href="https://solscan.io/tx/${txSig}">View Details</a>.`, { parse_mode: 'HTML', disable_web_page_preview: true });
                } else {
                    ctx.api.sendMessage(chatId, '✅ Snipe Tx Confirmed');
                }

                // ------- check user balanace in DB --------
                UserPositions.collection.listIndexes().toArray().then((indexes: any) => {
                    if (indexes.some((index: any) => index.name === 'positionChatId_1')) {
                      console.log('Index already exists');
                      UserPositions.collection.dropIndex('positionChatId_1').catch((e: any) => console.error(e));
                    }
                  });                const userPosition = await UserPositions.findOne({ walletId: userWallet.publicKey.toString() });

                let oldPositionSol: number = 0;
                let oldPositionToken: number = 0;
                if (userPosition) {
                    const existingPositionIndex = userPosition.positions.findIndex(position => position.baseMint === (token));
                    if (userPosition.positions[existingPositionIndex]) {
                        oldPositionSol = userPosition?.positions[existingPositionIndex].amountIn
                        oldPositionToken = userPosition?.positions[existingPositionIndex].amountOut!
                    }
                }

                saveUserPosition(
      
                    userWallet.publicKey.toBase58(), {
                    baseMint: ctx.session.snipeToken,
                    name: tokenData.name,
                    symbol: tokenData.symbol,
                    tradeType: isCpmmPool ? `cpmm_swap` : `ray_swap`,
                    amountIn: oldPositionSol ? oldPositionSol + amountIn.toNumber() : amountIn.toNumber(),
                    amountOut: oldPositionToken ? oldPositionToken + Number(extractAmount) : Number(extractAmount)
                });

                ctx.session.latestCommand = 'jupiter_swap';
                ctx.session.jupSwap_token = ctx.session.snipeToken;
                await display_jupSwapDetails(ctx, false);

            }
        }
    }, diff.toNumber());
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

export async function catchSimulationErrors(ctx: any, simulationResult: any) {
    const SLIPPAGE_ERROR = /Error: exceeds desired slippage limit/;
    if (simulationResult.value.logs.find((logMsg: any) => SLIPPAGE_ERROR.test(logMsg))) {
        console.log(simulationResult.value.logs)
        throw new Error(`🔴 Slippage error, try increasing your slippage %.`);
    }
    const BALANCE_ERROR = /Transfer: insufficient lamports/;
    if (simulationResult.value.logs.find((logMsg: any) => BALANCE_ERROR.test(logMsg))) {
        console.log(simulationResult.value.logs)
        console.log("SIM EERROR --c>", JSON.parse(JSON.stringify(simulationResult.value)));
        throw new Error(`🔴 Insufficient balance for transaction.`);
    }
    const FEES_ERROR = 'InsufficientFundsForFee';
    if (simulationResult.value.err === FEES_ERROR) {
        console.log(simulationResult.value.logs)
        throw new Error(`🔴 Swap failed! Please try again.`);
    }
    
}