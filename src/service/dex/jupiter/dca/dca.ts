import { CloseDCAParams, DCA, Network, type CreateDCAParamsV2, type DepositParams, type WithdrawParams } from '@jup-ag/dca-sdk';
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, sendAndConfirmTransaction, VersionedTransaction } from '@solana/web3.js';
import {CONNECTION, SOL_ADDRESS} from "../../../../config";
import bs58 from 'bs58';
import BigNumber from 'bignumber.js';
import { addMvxFeesInx, optimizedSendAndConfirmTransaction, wrapLegacyTx } from '../../../../service/util';
import { BN } from 'bn.js';

const connection = CONNECTION;
const dca = new DCA(connection, Network.MAINNET);
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const BONK = new PublicKey('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');


export async function create_dca(ctx: any) {
    const chatId = ctx.chat.id;
    const walletIdx = ctx.session.portfolio.activeWalletIndex;
    const wallet = ctx.session.portfolio.wallets[walletIdx];
    const userWallet: Keypair = Keypair.fromSecretKey(bs58.decode(String(wallet.secretKey)));
    let unixTimestamp = ctx.session.dca_start_time == 0 ? Math.floor(Date.now()):ctx.session.dca_start_time  // assumed to be in seconds
    console.log('unixTimestamp',unixTimestamp)
    const params: CreateDCAParamsV2 = {
        payer: wallet.publickey, // could have a different account pay for the tx (make sure this account is also a signer when sending the tx)
        user: wallet.publicKey,
        inAmount: BigInt(ctx.session.dca_amount * 1e9), // buy a total of 5 USDC over 5 days
        inAmountPerCycle: BigInt(ctx.session.dca_amount_per_cycle * 1e9), // buy using 1 USDC each day
        cycleSecondsApart: BigInt( ctx.session.dca_interval * 60 * 60 * 24), // 1 day between each order -> 60 * 60 * 24
        inputMint: new PublicKey(SOL_ADDRESS), // sell
        outputMint: new PublicKey(ctx.session.dca_token), // buy
        minOutAmountPerCycle: null,  // effectively allows for a max price. refer to Integration doc
        maxOutAmountPerCycle: null, // effectively allows for a min price. refer to Integration doc
        startAt: BigInt(unixTimestamp), // unix timestamp in seconds
        // optional: if the inputMint token is not in an Associated Token Account but some other token account, pass in the PublicKey of the token account, otherwise, leave it undefined
      };
      const { tx, dcaPubKey } = await dca.createDcaV2(params)

      let maxPriorityFee = Math.ceil(Number.parseFloat(String(ctx.session.customPriorityFee)) * 1e9);
      tx.instructions.push(ComputeBudgetProgram.setComputeUnitPrice({microLamports: maxPriorityFee }));
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const blockhash = (await connection.getLatestBlockhash()).blockhash;
      let solAmount: BigNumber = new BigNumber(ctx.session.dca_amount) ;
      let mvxFeeFromOrder = solAmount.multipliedBy(1e9)
      const txInxs = addMvxFeesInx(userWallet,  mvxFeeFromOrder);
      txInxs.forEach((inx) => {  tx.add(inx); });
      tx.sign(userWallet,userWallet);
      const versionTx : VersionedTransaction =  new VersionedTransaction(wrapLegacyTx(tx.instructions, userWallet, blockhash));
      versionTx.sign([userWallet]);
        await optimizedSendAndConfirmTransaction( versionTx,connection, blockhash, 50);
        console.log('dcaPubKey', dcaPubKey)
        return dcaPubKey

  

}

