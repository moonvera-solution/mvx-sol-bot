import axios from 'axios';
import dotenv from 'dotenv';
// import {getPoolDetails} from '../../index'
dotenv.config();


export async function getTokenPriceFromDexTools(tokenAddress: any) {
    try {
        const url = `https://open-api.dextools.io/free/v2/token/solana/${tokenAddress}/price`;
        const options = {
            method: 'GET',
            headers: {
                'X-BLOBR-KEY': `${process.env.DEXTOOLS_API_KEY}`
            }
        };

        const response = await axios.get(url, options);
        return response.data; // Adjust this based on the actual response structure
    } catch (error:any) {
        console.error('Error fetching token price from DexTools:', error.message);
        return null;
    }
}   
// export async function getLiquidityFromDextools(tokenAddress: any) {
//     try {
//         const poolData = await getPoolDetails(tokenAddress);

//         if (!poolData || !poolData.id) {
//             console.error('Pool data not found for token address:', tokenAddress);
//             return null;
//         }

//         const poolId = poolData.id; // Assuming this is the pool ID required by Dextools
//         const chain = 'solana'; // Replace with the correct chain name if different
//         const url = `https://open-api.dextools.io/free/v2/pool/${chain}/${poolId}/liquidity`;

//         const options = {
//             method: 'GET',
//             headers: {
//                 'X-BLOBR-KEY': 'mb9NzOSObhqViMIeMrbb26SngWthwrPJ'
//             }
//         };

//         const response = await axios.get(url, options);
//         const data = response.data.data;

//         const liquidityInfo = {
//             liquidity: data.liquidity, // Liquidity value
//             sideTokenReserve: data.reserves.sideToken // Side token reserve value
//         };
//         console.log(liquidityInfo)
//         return liquidityInfo;
//     } catch (error:any) {
//         console.error('Error fetching liquidity data from Dextools:', error.message);
//         return null;
//     }
// }

export async function getMarketCapFromDextools(chain: any, tokenAddress: any) {
    const url = `https://open-api.dextools.io/free/v2/token/${chain}/${tokenAddress}/info`;
    
    const options = {
        method: 'GET',
        headers: {
            'X-BLOBR-KEY': 'mb9NzOSObhqViMIeMrbb26SngWthwrPJ'
        }
    };

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`Error: ${response.status}`);
        }
        const data = await response.json();
      
        // Assuming the market cap is a field in the response
        const marketCap = data.data.fdv;
        // console.log("marketcap",marketCap ) // Adjust based on actual response structure
        return marketCap;
    } catch (error:any) {
        console.error('Error fetching market cap from Dextools:', error.message);
        return null;
    }
}

export async function getHoldersFromDextools(chain: any, tokenAddress: any) {
    const url = `https://open-api.dextools.io/free/v2/token/${chain}/${tokenAddress}/info`;
    
    const options = {
        method: 'GET',
        headers: {
            'X-BLOBR-KEY': 'mb9NzOSObhqViMIeMrbb26SngWthwrPJ'
        }
    };

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`Error: ${response.status}`);
        }
        const data = await response.json();
        // console.log("dataa:", data)
        // Assuming the market cap is a field in the response
        const holdersToken = data.data.holders; // Adjust based on actual response structure
        return holdersToken;
    } catch (error:any) {
        console.error('Error fetching market cap from Dextools:', error.message);
        return null;
    }
}

 function formatVariation(variation: any) {
    // Handle cases where variation data is not available
    if (variation === null || variation === undefined) {
        return 'N/A';
    }
    return `${variation.toFixed(2)}%`;
}

export async function getPriceChangesFromDextools(tokenAddress: any) {
    const priceData = await getTokenPriceFromDexTools(tokenAddress);
    if (!priceData || !priceData.data) {
        console.error('No price data available for token:', tokenAddress);
        return null;
    }

    const variations = {
        variation5m: formatVariation(priceData.data.variation5m),
        variation1h: formatVariation(priceData.data.variation1h),
        variation6h: formatVariation(priceData.data.variation6h),
        variation24h: formatVariation(priceData.data.variation24h)
    };

    return variations;
}


// getTokenPriceFromDexTools('FvVDc6gZmYho6DLLuJ3ptHS6rxb797Cxf1insiUnu2BL');
/**
 * res:  {
  statusCode: 200,
  data: {
    price: 0.000005382494203708073,
    priceChain: 6.349850045718429e-8,
    variation5m: null,
    variationChain5m: null,
    variation1h: null,
    variationChain1h: null,
    price6h: 0.0000064088413645406044,
    priceChain6h: 7.830136448042653e-8,
    variation6h: -16.014550875158097,
    variationChain6h: -18.904988593069284,
    price24h: 0.000005004809703187091,
    priceChain24h: 5.924574466799077e-8,
    variation24h: 7.546430791973369,
    variationChain24h: 7.178162436856317
  }
}
 */
