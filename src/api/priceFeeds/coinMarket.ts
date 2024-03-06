import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export async function getSolanaDetails() {
    try {
        const response = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', {
            params: {
                'symbol': 'SOL',  // Symbol for Solana
                'convert': 'USD'  // Currency conversion
            },
            headers: {
                'X-CMC_PRO_API_KEY': `${process.env.COIN_MARKET_API_KEY}`,
            }
        });
        // console.log('Solana details:', response.data.data.SOL.quote.USD.price);
        return response.data.data.SOL.quote.USD.price;

    } catch (error:any) {
        console.error('Error fetching Solana details:', error.message);
        return null;
    }
}

getSolanaDetails();