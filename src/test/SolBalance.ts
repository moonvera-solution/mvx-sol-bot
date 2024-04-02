
import {Connection,PublicKey} from '@solana/web3.js';

export async function getSolBalance(publicKeyString: any, connection: Connection) {
    const publicKey = publicKeyString instanceof PublicKey ? publicKeyString : new PublicKey(publicKeyString);
    try {
        const balance = await connection.getBalance(publicKey);
        return balance / 1e9; // Convert lamports to SOL
    } catch (error: any) {
        console.error('Error fetching SOL balance:', error.message);
        return 0;
    }
}

async function printWalletBalances(data: any[], connection: Connection) {
    for (const item of data) {
        for (const wallet of item.wallets) {
            const balance = await getSolBalance(wallet.publicKey, connection);
            console.log(`${wallet.publicKey}:${balance}`);
        }
    }
}


// Assuming data is your array of objects
function filterWalletIdAndSecretKey(data:any) {
    const result = [];
    for (const item of data) {
        for (const wallet of item.wallets) {
            result.push({walletId: wallet.walletId, secretKey: wallet.secretKey});
        }
    }
    return result;
}
// printWalletBalances().then(() => {})