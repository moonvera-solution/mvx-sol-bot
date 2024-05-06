import axios from 'axios';
import dotenv from 'dotenv';
import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
} from "@solana/web3.js";
dotenv.config();

export async function getTokenPriceFromJupiter(tokenAddress: String) {
    try {
        // const url = "https://price.jup.ag/v4/price?ids=SOL&vsToken=mSOL"
        const url = `https://price.jup.ag/v4/price?ids=${tokenAddress}&vsToken=So11111111111111111111111111111111111111112`
        const options = {
            method: 'GET',
            headers: {
                "accept": " application/json"
            }
        };

        const response = await axios.get(url, options);
        console.log("response",response.data.data[`${tokenAddress}`].price)
        return await response.data.data[`${tokenAddress}`].price ;
       // Adjust this based on the actual response structure
    } catch (error: any) {
        console.log(
            error.message
        );
        return null;
    }
}



// Example:
// getTokenPriceFromJupiter('FvVDc6gZmYho6DLLuJ3ptHS6rxb797Cxf1insiUnu2BL');
/**
 * response {
  data: {
    SOL: {
      id: 'So11111111111111111111111111111111111111112',
      mintSymbol: 'SOL',
      vsToken: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
      vsTokenSymbol: 'mSOL',
      price: 0.859630202
    }
  },
  timeTaken: 0.00022790999992139405
}
 */
async function deriveReferralAcc() {
    const [feeAccount] = await PublicKey.findProgramAddressSync(
        [
            Buffer.from("referral_ata"),
            new PublicKey('SSsBLR8W6eGQMT3pGt82bVRqy3WRRXPRW6VHLGWJQPz').toBuffer(), // your referral account public key
            new PublicKey("FvVDc6gZmYho6DLLuJ3ptHS6rxb797Cxf1insiUnu2BL").toBuffer()
        ],
        new PublicKey("REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3") // the Referral Program
    );
    // console.log("", feeAccount.toBase58());
    return feeAccount;
}

deriveReferralAcc()
//6SP3dim8MuijtwKNmF8G22xJ6o67jKeaskH5REq2bLWm