import { Connection, PublicKey, TokenAccountsFilter } from '@solana/web3.js';

/**
 * Get the balance of a specific token in a Solana wallet.
 * 
 * @param {string} walletAddress The public key of the wallet.
 * @param {string} mintAddress The mint address of the token.
 * @returns The balance of the token in the wallet.
 */
async function getTokenBalance(walletAddress: any, mintAddress: any) {
    const connection = new Connection("https://api.mainnet-beta.solana.com"); // Change the cluster if needed
    const walletPublicKey = new PublicKey(walletAddress);
    const tokenMintAddress = new PublicKey(mintAddress);

    try {
        const filter: TokenAccountsFilter = {
            mint: tokenMintAddress
        };
        
        const { value } = await connection.getParsedTokenAccountsByOwner(walletPublicKey, filter);
        const accountInfo = value.find(account => account.account.data.parsed.info.mint === mintAddress);

        if (accountInfo) {
            return accountInfo.account.data.parsed.info.tokenAmount.uiAmount;
        } else {
            throw new Error("Token account not found.");
        }
    } catch (error) {
        console.error('Error fetching token balance:', error);
        throw error;
    }
}

// Example usage
const walletAddress = 'cVsN11LTUjictK1sUMsxdT5J2PKxZcJ858RXKNVuuZ4';
const mintAddress = 'FvVDc6gZmYho6DLLuJ3ptHS6rxb797Cxf1insiUnu2BL';
// getTokenBalance(walletAddress, mintAddress)
//     .then(balance => console.log('Token Balance:', balance))
//     .catch(error => console.error('Error:', error));
