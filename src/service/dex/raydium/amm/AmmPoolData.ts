import { Connection } from "@solana/web3.js";
import { Raydium, TxVersion, parseTokenAccountResp, CpmmKeys } from '@raydium-io/raydium-sdk-v2'
let raydium: Raydium | undefined;

export async function initSdk( connection: Connection) {
    if (raydium) return raydium
    // console.log("--c>, ", wallet.publicKey.toBase58());
    raydium = await Raydium.load({
      connection,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: false
    });
    return raydium
  }

