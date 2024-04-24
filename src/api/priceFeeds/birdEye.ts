import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export async function getTokenDataFromBirdEye(tokenAddress: String) {
    try {
        const url = `https://public-api.birdeye.so/defi/token_overview?address=${tokenAddress}`;
        const url2 = `https://public-api.birdeye.so/defi/token_security?address=${tokenAddress}`;

        const options = {
            method: 'GET',
            headers: {
               
                "x-chain": "solana",
                'X-API-KEY': `${process.env.BIRD_EYE_API_KEY}`
            }
        };

        const response = await axios.get(url, options);
        const response2 = await axios.get(url2, options);
        // console.log("response",response.data.data.mc)
        // console.log("response2",response2.data.data)
        return {response,response2}; // Adjust this based on the actual response structure
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
                "x-chain": "solana",
                'X-API-KEY': `${process.env.BIRD_EYE_API_KEY}`
            }
        };

        const response = await axios.get(url, options);
        console.log("response",response.data)
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


export async function getSolanaDetails() {
    

    try {
        const options = {method: 'GET', headers: {'X-API-KEY': 'f134abedf1c44496b3554ffc610b47f4'}};

        const response = await axios.get('https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112', options);
        // const data = await response.json();
        console.log(response.data.data.value);
        return response.data.data.value;
    } catch (error:any) {
        console.error('Error fetching Solana details:', error.message);
        return null;
    }
}
// getSolanaDetails()
// Example:
getTokenDataFromBirdEye('bobaM3u8QmqZhY1HwAtnvze9DLXvkgKYk3td3t8MLva');
// getTokenOwnerPercentageFromBirdEye('4hw1dhVQA1iveLfnVzGxRnWZKsuuBUv3XzjftGRuRmJf')
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

