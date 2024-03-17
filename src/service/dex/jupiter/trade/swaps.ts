import { Connection, Keypair, TransactionMessage, VersionedTransaction, SystemProgram, PublicKey } from '@solana/web3.js';
import fetch from 'cross-fetch';
import { Wallet } from '@project-serum/anchor';
import BigNumber from 'bignumber.js';
import { ISESSION_DATA } from '../../../../service/util/types';
import bs58 from 'bs58';

import {
    buildAndSendTx
  } from "../../../util";
// It is recommended that you use your own RPC endpoint.
// This RPC endpoint is only for demonstration purposes so that this example will run.

export async function handleJupiterSell(
    ctx:any,
    tokenIn: string,
    amountIn: number
) {
    const session: ISESSION_DATA = ctx.session;
    const userWallet = session.portfolio.wallets[session.activeWalletIndex];
    const wallet = Keypair.fromSecretKey(bs58.decode(String(userWallet.secretKey)));
    const SOL = 'So11111111111111111111111111111111111111112';
    let slippageBps = session.latestSlippage;

    
    // Swapping SOL to USDC with input 0.1 SOL and 0.5% slippage
    const quoteResponse = await (
        await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${tokenIn}&outputMint=${SOL}&amount=${amountIn}&slippageBps=${slippageBps}`)
    ).json();

    // get serialized transactions for the swap
    const { swapTransaction } = await (
        await fetch('https://quote-api.jup.ag/v6/swap', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // quoteResponse from /quote api
                quoteResponse,
                // user public key to be used for the swap
                userPublicKey: wallet.publicKey.toString(),
                // auto wrap and unwrap SOL. default is true
                wrapAndUnwrapSol: true,
                // feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in /quote API.
                // feeAccount: "fee_account_public_key"
            })
        })
    ).json();

    console.log("quoteResponse:: ", { quoteResponse });

    if(quoteResponse.outAmount){
        swapTransaction.push(
            SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: new PublicKey("37UKEEEfeotv2SRvursNBp7VfRvKkywkQchYUgTREcEc"),
                lamports: BigInt(new BigNumber(quoteResponse.outAmount).times(0.05).toFixed(0)), // 5_000 || 6_000
            })
        );
    }

    
    return {
        txids: await buildAndSendTx(
          wallet,
          swapTransaction,
          {preflightCommitment:'processed'}
        )
      }; 
}
