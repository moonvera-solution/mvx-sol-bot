import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import SolanaTracker from "..";

async function swap() {
  const keypair = Keypair.fromSecretKey(
    bs58.decode(
      "54vMoHfpfFVn2e6Nk6pWU9c9TTmwm4mN1s6aQcrjzgeABZWWt9SbUhcuBXBUuTuYYq6GpLkM6XmuPXZb7dJqmncR"
    )
  );
  const headers:any='x-api-key: 13460529-40af-40d4-8834-2a37f1701aa4';
  const url:any=' https://swap-api-xmb4.solanatracker.io';

    const solanaTracker = new SolanaTracker(
    keypair,
    "https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41",
    url,headers
  );

  const swapResponse = await solanaTracker.getSwapInstructions(
    "So11111111111111111111111111111111111111112", // From Token
    "Crfyfv4cxy9qHqCvRsckeTsPgW5ikrXveEKaFV3ETHFn", // To Token
    0.005, // Amount to swap
    300, // Slippage
    keypair.publicKey.toBase58(), // Payer public key
    0.0005, // Priority fee (Recommended while network is congested)
    true // Force legacy transaction for Jupiter
  );
  console.log("swapResponse", swapResponse);
  const txid = await solanaTracker.performSwap(swapResponse, {
    sendOptions: { skipPreflight: true },
    confirmationRetries: 30,
    confirmationRetryTimeout: 1000,
    lastValidBlockHeightBuffer: 150,
    resendInterval: 1000,
    confirmationCheckInterval: 100,
    skipConfirmationCheck: true // Set to true if you want to skip confirmation checks and return txid immediately
  });
  // Returns txid when the swap is successful or throws an error if the swap fails
  console.log("Transaction ID:", txid);
  console.log("Transaction URL:", `https://solscan.io/tx/${txid}`);
}

// swap();
