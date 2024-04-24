import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export async function getTokenDataFromBirdEye(tokenAddress: String) {
    try {
        const url = `https://public-api.birdeye.so/defi/token_overview?address=${tokenAddress}`;
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
export async function getTokenOwnerPercentageFromBirdEye(tokenAddress: String) {
    try {
        const url = `https://public-api.birdeye.so/defi/token_security?address=${tokenAddress}`;
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
        const options = {method: 'GET', headers: {'X-API-KEY': '5cbf6ca613634d29b10b2d6dbb3989ff'}};

        const response = await fetch('https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112', options);
        const data = await response.json();
        // console.log(data.data.value);
        return data.data.value;
    } catch (error:any) {
        console.error('Error fetching Solana details:', error.message);
        return null;
    }
}
getSolanaDetails()
// Example:
// getTokenDataFromBirdEye('FvVDc6gZmYho6DLLuJ3ptHS6rxb797Cxf1insiUnu2BL');
/**
 * Response:
    {
    "data": {
        "value": 23.44450796529084,
        "updateUnixTime": 1692175119,
        "updateHumanTime": "2023-08-16T08:38:39"
    },
    "success": true
    }
 */

