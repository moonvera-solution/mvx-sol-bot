// import { Connection } from '@solana/web3.js';

// const connection = new Connection('https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41');
// async function getSignatureSta(signature: string) {
//     try {
//         const config = {
//             searchTransactionHistory: true 
//         };
//         const response = await connection.getSignatureStatus(signature, config);
//         console.log('Signature status:', response.value?.err);
//         return response;
//     } catch (error:any) {
//         console.error('Error fetching signature status:', error.message);
//         // return null;
//     }

// }
// getSignatureSta('4j7YJMfiRnsSfRENdmbATKx5f8DL3pcTzTAmHtGZhv3aDZPLz1V8GgdFEYJqEHhD3KNKzqeWDVrY8uZt9MEp7k5K'); 

// import axios from 'axios';
// import dotenv from 'dotenv';
// dotenv.config();

// export async function getSolanaDetails() {
//     try {
//         const response = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', {
//             params: {
//                 'symbol': 'SOL',  // Symbol for Solana
//                 'convert': 'USD'  // Currency conversion
//             },
//             headers: {
//                 'X-CMC_PRO_API_KEY': `${process.env.COIN_MARKET_API_KEY}`,
//             }
//         });
//         // console.log('Solana details:', response.data.data.SOL.quote.USD.price);
//         return response.data.data.SOL.quote.USD.price;

//     } catch (error:any) {
//         console.error('Error fetching Solana details:', error.message);
//         return null;
//     }
// }

// getSolanaDetails();