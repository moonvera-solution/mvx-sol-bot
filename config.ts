
import dotenv from 'dotenv';
dotenv.config();
import {
  ENDPOINT as _ENDPOINT,
  Currency,
  LOOKUP_TABLE_CACHE,
  MAINNET_PROGRAM_ID,
  RAYDIUM_MAINNET,
  Token,
  TOKEN_PROGRAM_ID,
  TxVersion,
} from '@raydium-io/raydium-sdk';
import {
  Connection,
  Keypair,
  PublicKey,
} from '@solana/web3.js';
import bs58 from 'bs58';
import BigNumber from 'bignumber.js';

// ONLY FOR SWAP TESTING
export const secretKey = bs58.decode(process.env.TEST_WALLET_PK!);
export const wallet: Keypair = Keypair.fromSecretKey(secretKey)
const KEY = '6d493ba7-5dee-4bb2-bf04-08490e3da3de'

// const connection_only = new Connection('https://newest-thrumming-daylight.solana-mainnet.quiknode.pro/ac301e78b878c03111c8454e3f14bacc4f8b0471/');
// const connection_only = new Connection('https://solana-mainnet.g.alchemy.com/v2/Gg5lG0l2dvs8Gir_h_Mctau-gnc3ypAs');
// const connection_only = new Connection('https://mainnet.helius-rpc.com/?api-key=6d493ba7-5dee-4bb2-bf04-08490e3da3de')
const NODE_URL = 'https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41';

const connection_only = new Connection(NODE_URL);

  // const wss_connection_1 = 'wss://api.mainnet-beta.solana.com';
  // const wss_connection_2 = 'wss://quick-smart-firefly.solana-mainnet.quiknode.pro/d04810797dc080df6ee57caa5096c5e75f023d2f/';
  export const connection = connection_only;
  export const PROGRAMIDS = MAINNET_PROGRAM_ID;
  export const ENDPOINT = _ENDPOINT;
  export const RAYDIUM_MAINNET_API = RAYDIUM_MAINNET;
  export const makeTxVersion = TxVersion.V0; // LEGACY
  export const addLookupTableInfo = LOOKUP_TABLE_CACHE // only mainnet. other = undefined
  export const TRITON_RPC_URL = process.env.TRITON_RPC_URL;
  export const TRITON_RPC_TOKEN = process.env.TRITON_RPC_TOKEN;
  export const DEFAULT_KEY_DIR_NAME = ".local_keys";
  export const DEFAULT_PUBLIC_KEY_FILE = "keys.json";
  export const DEFAULT_DEMO_DATA_FILE = "demo.json";
  export const JITO_ACCESS_TOKEN=process.env.JITO_ACCESS_TOKEN;
  export const JUPITER_REFERRAL_ACCOUNT_PK = process.env.JUPITER_REFERRAL_ACCOUNT_PK;

export const DEFAULT_TOKEN = {
  // 'SOL': new Currency(9, 'USDC', 'USDC'),
  'WSOL': new Token(TOKEN_PROGRAM_ID, new PublicKey('So11111111111111111111111111111111111111112'), 9, 'WSOL', 'WSOL'),
  'USDC': new Token(TOKEN_PROGRAM_ID, new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), 6, 'USDC', 'USDC'),
  'RAY': new Token(TOKEN_PROGRAM_ID, new PublicKey('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'), 6, 'RAY', 'RAY'),
  'SOLFI': new Token(TOKEN_PROGRAM_ID, new PublicKey('FvVDc6gZmYho6DLLuJ3ptHS6rxb797Cxf1insiUnu2BL'), 8, 'SOLFI', 'SOLFI'),
  'RAY_USDC-LP': new Token(TOKEN_PROGRAM_ID, new PublicKey('FGYXP4vBkMEtKhxrmEBcWN8VNmXX8qNgEJpENKDETZ4Y'), 6, 'RAY-USDC', 'RAY-USDC'),
  'SOLFI_SOL_LP': new Token(TOKEN_PROGRAM_ID, new PublicKey('DtU8TMzfQAFSTjEcRUBAwBrWzkv6a32maR6FiezV8hGd'), 8, 'SOLFI-SOL', 'SOLFI-SOL'),
  'SOLFI_SOL_V4_POOL': '46MCgSVT6KdBNK9UiBgyhEUPY3VbJRu8aZ3X1MQKxTeV' // AMM ID
}

export const MVXBOT_FEES = BigNumber(0.005) //it has to be divided by 100 here
/**
 * PAIR addr = DtU8TMzfQAFSTjEcRUBAwBrWzkv6a32maR6FiezV8hGd
 * SOLFI addr = FvVDc6gZmYho6DLLuJ3ptHS6rxb797Cxf1insiUnu2BL
 * SOLFI-SOL = 46MCgSVT6KdBNK9UiBgyhEUPY3VbJRu8aZ3X1MQKxTeV Radyum v4 Pool
 * RADYUM LIQUIDITY POOL V4 PROGRAM ID = 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8
 * 
 * BLOCK_ENGINE_URL=https://ny.mainnet.block-engine.jito.wtf
   RELAYER_URL=http://ny.mainnet.relayer.jito.wtf:8100
   SHRED_RECEIVER_ADDR=141.98.216.96:1002
 */