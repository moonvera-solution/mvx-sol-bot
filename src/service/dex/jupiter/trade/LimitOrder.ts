import { LimitOrderProvider} from "@jup-ag/limit-order-sdk";
import { Keypair,Connection,PublicKey,sendAndConfirmTransaction ,TransactionSignature} from "@solana/web3.js";
import {BN} from "@coral-xyz/anchor";
import  bs58 from 'bs58';
import {getTokenDataFromBirdEye} from "../../../../api/priceFeeds/birdEye";
import {getTokenPriceFromJupiter} from "../../../../api/priceFeeds/jupiter";
import dotenv from 'dotenv'; dotenv.config();

// The Jupiter Limit Order's project account for the Referral Program is 
// 45ruCyfdRkWpRNGEqWzjCiXRHkZs8WXCLQ67Pnpye7Hp referral fees are withdrawable here.

const connection = new Connection(`${process.env.TRITON_RPC_URL!}${process.env.TRITON_RPC_TOKEN!}`);
const MVX_JUP_REFERRAL = "HH2UqSLMJZ9VP9jnneixYKe3oW8873S9MLUuMF3xvjLH";
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.JUP_REF_ACCOUNT_AUTHORITY_KEY!));

/**
 * Fetch latest fair price or current price (CP)
 * * Give user buttons to 
 * * * set sell order at multiple % up of CP
 * * * set buy order at multiple % down of CP
 * * * set order expiration time 1hr, 2hr, Never
 */

async function _setLimitOrder( // 0.08
    inputToken: PublicKey,
    inAmount: BN,
    outputToken: PublicKey,
    outAmount: BN,
    expiredAt?: BN
): Promise<TransactionSignature>{
    const limitOrder = new LimitOrderProvider(connection, new PublicKey(MVX_JUP_REFERRAL));
    
    const base = Keypair.generate(); // random unique order id
    const { tx, orderPubKey } = await limitOrder.createOrder({ // 2.5 fee jup
        owner: wallet.publicKey,
        inAmount: new BN(1000000), // 1000000 => 1 USDC if inputToken.address is USDC mint
        outAmount: new BN(12771169527),
        inputMint: new PublicKey(inputToken),
        outputMint: new PublicKey(outputToken),
        expiredAt:  expiredAt ?? null, // new BN(new Date().valueOf() / 1000)
        base: base.publicKey 
    });

    const txSig = await sendAndConfirmTransaction(connection, tx, [wallet, base]);
    console.log("txSig:: ",txSig);
    return txSig;
}


export async function setLimitOrder(tokenAddress:String){
    let amountIn =  0.01 * 10 ** 9;
    let amountOut = await getTokenPriceFromJupiter(tokenAddress);
    amountOut = Math.abs(amountOut);
    console.log("amountOut:: ",Math.abs(amountOut));

    // amountOut = amountOut.WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk.price;
    
    amountOut = amountOut * amountIn;
    console.log("amountOut:: ",(amountOut));
    try {
        _setLimitOrder(
            new PublicKey('So11111111111111111111111111111111111111112'),
            new BN(amountIn),
            new PublicKey(tokenAddress),
            new BN(amountOut)
        );
    }catch(e:any){
        console.log(e.message);
    }
}


setLimitOrder('WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk');

/**
 * solana transfer --from DDL8apK4Xr3CYa6vxLccNkJAcX2bQdqRS8o51h2sBeTP.json GF7Mi4vZh4pZPCjwVTXHSDCQCAT9s7WMnGHiiqaP2m7s 30000  --allow-unfunded-recipient
 */