import { LimitOrderProvider} from "@jup-ag/limit-order-sdk";
import { Keypair,PublicKey,sendAndConfirmTransaction ,TransactionSignature} from "@solana/web3.js";
import {BN} from "@coral-xyz/anchor";
import { connection, wallet,DEFAULT_TOKEN ,JUPITER_REFERRAL_ACCOUNT_PK} from "../../../../../config";
import {getTokenDataFromBirdEye} from "../../../../api/priceFeeds/birdEye";
import {getTokenPriceFromJupiter} from "../../../../api/priceFeeds/jupiter";

// The Jupiter Limit Order's project account for the Referral Program is 
// 45ruCyfdRkWpRNGEqWzjCiXRHkZs8WXCLQ67Pnpye7Hp.


/**
 * Fetch latest fair price or current price (CP)
 * * Give user buttons to 
 * * * set sell order at multiple % up of CP
 * * * set buy order at multiple % down of CP
 * * * set order expiration time 1hr, 2hr, Never
 */

async function _setLimitOrder(
    inputToken: PublicKey,
    inAmount: BN,
    outputToken: PublicKey,
    outAmount: BN,
    expiredAt?: BN
): Promise<TransactionSignature>{
    const limitOrder = new LimitOrderProvider(
        connection, new PublicKey(JUPITER_REFERRAL_ACCOUNT_PK!),// referralName
    );
    
    const base = Keypair.generate(); // random unique order id
    const { tx, orderPubKey } = await limitOrder.createOrder({
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
    amountOut = await amountOut.data;
    amountOut = amountOut.FvVDc6gZmYho6DLLuJ3ptHS6rxb797Cxf1insiUnu2BL.price;
    
    console.log("amountOut:: ",Math.abs(amountOut));

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


setLimitOrder('FvVDc6gZmYho6DLLuJ3ptHS6rxb797Cxf1insiUnu2BL');

/**
 * solana transfer --from DDL8apK4Xr3CYa6vxLccNkJAcX2bQdqRS8o51h2sBeTP.json GF7Mi4vZh4pZPCjwVTXHSDCQCAT9s7WMnGHiiqaP2m7s 30000  --allow-unfunded-recipient
 */