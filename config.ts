
import dotenv from 'dotenv';
dotenv.config();
import {
  ENDPOINT as _ENDPOINT,
  LOOKUP_TABLE_CACHE,
  MAINNET_PROGRAM_ID,
  RAYDIUM_MAINNET,
  Token,
  TOKEN_PROGRAM_ID,
  TxVersion,
} from '@raydium-io/raydium-sdk';
import {
  Connection,
  PublicKey,
} from '@solana/web3.js';
import BigNumber from 'bignumber.js';

export const PROGRAMIDS = MAINNET_PROGRAM_ID;
export const ENDPOINT = _ENDPOINT;
export const RAYDIUM_MAINNET_API = RAYDIUM_MAINNET;
export const makeTxVersion = TxVersion.V0; // LEGACY
export const addLookupTableInfo = LOOKUP_TABLE_CACHE // only mainnet. other = undefined
export const DEFAULT_KEY_DIR_NAME = ".local_keys";
export const DEFAULT_PUBLIC_KEY_FILE = "keys.json";
export const DEFAULT_DEMO_DATA_FILE = "demo.json";
export const RAYDIUM_AUTHORITY = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1';
export const SOL_ADDRESS = "So11111111111111111111111111111111111111112";
export const WEN_ADDRESS = "WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk";
export const DEFAULT_PUBLIC_KEY = new PublicKey("11111111111111111111111111111111");
export const MVX_JUP_REFERRAL = "HH2UqSLMJZ9VP9jnneixYKe3oW8873S9MLUuMF3xvjLH";
export const JUP_REF_PROGRAM = "45ruCyfdRkWpRNGEqWzjCiXRHkZs8WXCLQ67Pnpye7Hp";  
export const JUP_AGGREGATOR_V6 = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";


export const DEFAULT_TOKEN = {
  // 'SOL': new Currency(9, 'USDC', 'USDC'),
  'WSOL': new Token(TOKEN_PROGRAM_ID, new PublicKey('So11111111111111111111111111111111111111112'), 9, 'WSOL', 'WSOL'),
  'USDC': new Token(TOKEN_PROGRAM_ID, new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), 6, 'USDC', 'USDC'),
  'RAY': new Token(TOKEN_PROGRAM_ID, new PublicKey('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'), 6, 'RAY', 'RAY'),
  'SOLFI': new Token(TOKEN_PROGRAM_ID, new PublicKey('FvVDc6gZmYho6DLLuJ3ptHS6rxb797Cxf1insiUnu2BL'), 8, 'SOLFI', 'SOLFI'),
  'WEN': new Token(TOKEN_PROGRAM_ID, new PublicKey('WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk'), 5, 'WEN', 'WEN'),
  'JUP': new Token(TOKEN_PROGRAM_ID, new PublicKey('JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'), 6, 'JUP', 'JUP'),

}

export const MVXBOT_FEES = BigNumber(0.008) // this is %
export const TIP_VALIDATOR = 800000 // this is %

export const SNIPE_SIMULATION_COUNT_LIMIT = 2000;
export const DEFAULT_PRIORITY_FEE_UNITS = 500_000;
export const DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS = 100_000;
export const WALLET_MVX = 'MvXfSe3TeEwsEi731Udae7ecReLQPgrNuKWZzX6RB41';
