import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export async function getTokenDataFromBirdEye(tokenAddress: String) {
    try {
        const url = `https://public-api.birdeye.so/defi/token_overview?address=${tokenAddress}`;
        const url2 = `https://public-api.birdeye.so/defi/token_security?address=${tokenAddress}`;
        const solanDetails = 'https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112';


        const options = {
            method: 'GET',
            headers: {
               
                "x-chain": "solana",
                'X-API-KEY': `${process.env.BIRD_EYE_API_KEY}`
            }
        };
        const [response, response2,solanaPrice] = await Promise.all([axios.get(url, options), axios.get(url2, options), axios.get(solanDetails, options)]); // [response1, response2
        // const response = await axios.get(url, options);
        // const response2 = await axios.get(url2, options);
        // console.log("response",response.data.data.realMc)
        return {response,response2,solanaPrice}; // Adjust this based on the actual response structure
    } catch (error:any) {
        console.error(
            error.message
        );
        return null;
    }
}

export async function getTokenOwnerPercentageFromBirdEye() {
    try {
        const url = 'https://public-api.birdeye.so/v1/wallet/tx_list?wallet=C44ibjuJo38XsYC16CNkq3z1rnyo5mYNf5SLxa8J3koA&limit=30';
        const options = {
            method: 'GET',
            headers: {
                "x-chain": "solana",
                'X-API-KEY': `${process.env.BIRD_EYE_API_KEY}`
            }
        };
        
        const response = await axios.get(url, options);
        console.log("response",response.data.data.solana)
        return await response.data.data.solana; // Adjust this based on the actual response structure
    } catch (error:any) {
        console.error(
            error.message
        );
        return null;
    }
}
// getTokenOwnerPercentageFromBirdEye()
export async function getTokenOwnerFromBirdEye(tokenAddress: String) {
    try {
        const url = `https://public-api.birdeye.so/defi/token_creation_info?address=${tokenAddress}`;
        const options = {
            method: 'GET',
            headers: {
                "accept": " application/json",
                "x-chain": "solana",
                'X-API-KEY': `${process.env.BIRD_EYE_API_KEY}`
            }
        };

        const response = await axios.get(url, options);
        // console.log("response",response.data)
        return await response.data; // Adjust this based on the actual response structure
    } catch (error:any) {
        console.error(
            error.message
        );
        return null;
    }
}


export async function getSolanaDetails() {
    

    try {
        const options = {method: 'GET', headers: {'X-API-KEY': 'f134abedf1c44496b3554ffc610b47f4'}};

        const response = await axios.get('https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112', options);
        // const data = await response.json();
        // console.log(response.data.data.value);
        return response.data.data.value;
    } catch (error:any) {
        console.error('Error fetching Solana details:', error.message);
        return null;
    }
}

// get the portfolio of a user and filter 0 value tokens (true)
// token amount and tokne value and address 

// wallet addres and token address to query the tx

// query the tx of the user portfolio tokens
// get the amount in
// do the pnl calculation
