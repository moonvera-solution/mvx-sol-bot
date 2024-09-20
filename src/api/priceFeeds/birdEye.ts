import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export async function getTokenDataFromBirdEye(tokenAddress: String, userWallet: String) {
    try {
        const url = `https://public-api.birdeye.so/defi/token_overview?address=${tokenAddress}`;
        const url2 = `https://public-api.birdeye.so/defi/token_security?address=${tokenAddress}`;
        const solanDetails = 'https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112';
        const walletTokenBalance = `https://public-api.birdeye.so/v1/wallet/token_balance?wallet=${userWallet}&token_address=${tokenAddress}`;

        const options = {
            method: 'GET',
            headers: {
               
                "x-chain": "solana",
                'X-API-KEY': `${process.env.BIRD_EYE_API_KEY}`
            }
        };
        const [response, response2, solanaPrice, walletTokenPosition] = await Promise.all([
            fetch(url, options).then(res => res.json()),
            fetch(url2, options).then(res => res.json()),
            fetch(solanDetails, options).then(res => res.json()),
            fetch(walletTokenBalance, options).then(res => res.json()),
        ]);  


        return {response,response2,solanaPrice,walletTokenPosition}; // Adjust this based on the actual response structure
    } catch (error:any) {
        console.error(
            error.message
        );
        return null;
    }
}
export async function getTokenDataFromBirdEyePositions(tokenAddress: string, userWallet: string) {
    try {
        const url = `https://public-api.birdeye.so/defi/token_overview?address=${tokenAddress}`;
        const url2 = `https://public-api.birdeye.so/defi/token_security?address=${tokenAddress}`;
        const solanDetails = 'https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112';
        const walletTokenBalance = `https://public-api.birdeye.so/v1/wallet/token_balance?wallet=BufhUw6vTmPB5ytaAWfHb6xUCUdVqHGZn9eQenSJmgmP&token_address=${tokenAddress}`;
        const birdeyeTokenPosition = `https://public-api.birdeye.so/v1/wallet/token_list?wallet=${userWallet}`;
        const MarketData = `https://public-api.birdeye.so/defi/v2/markets?address=${tokenAddress}&sort_by=liquidity&sort_type=desc`;

        const options = {
            method: 'GET',
            headers: {
                "x-chain": "solana",
                'X-API-KEY': `${process.env.BIRD_EYE_API_KEY}`
            }
        };

        const [response, response2, solanaPrice, walletTokenPosition, birdeyePosition, marketDex] = await Promise.all([
            fetch(url, options).then(res => res.json()),
            fetch(url2, options).then(res => res.json()),
            fetch(solanDetails, options).then(res => res.json()),
            fetch(walletTokenBalance, options).then(res => res.json()),
            fetch(birdeyeTokenPosition, options).then(res => res.json()),
            fetch(MarketData, options).then(res => res.json())
        ]);

        return { response, response2, solanaPrice, walletTokenPosition, birdeyePosition, marketDex }; // Adjust this based on the actual response structure
    } catch (error: any) {
        console.error(error.message);
        return null;
    }
}


export async function getSolanaDetails() {
    

    try {
        const options = {method: 'GET', headers: {'X-API-KEY': 'f134abedf1c44496b3554ffc610b47f4'}};

        const response = await fetch('https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112', options).then((response) => response.json());
        // const data = await response.json();
    
        return response.data.value;
    } catch (error:any) {
        console.error('Error fetching Solana details:', error.message);
        return null;
    }
}

export async function memeTokenPrice(token: any) {
    try {
        const options = {
            method: 'GET',
            headers: {
                "x-chain": "solana",
                'X-API-KEY': `${process.env.BIRD_EYE_API_KEY}`
            }
        };
        const response = await fetch(`https://public-api.birdeye.so/defi/token_overview?address=${token}`, options).then((response) => response.json());
        return response.data.price;
    } catch (error:any) {
        console.error('Error fetching Solana details:', error.message);
        return null;
    }

}

export async function getWalletNetWorth(wallet: string) {
    const options = {
        method: 'GET',
        headers: {
            "x-chain": "solana",
            'X-API-KEY': `f134abedf1c44496b3554ffc610b47f4`
        }
    };
    const response = await fetch(`https://public-api.birdeye.so/v1/wallet/token_list?wallet=${wallet}`, options).then(res => res.json());

    return response.data.totalUsd
}

