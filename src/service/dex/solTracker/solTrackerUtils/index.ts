import axios from "axios";
import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
  BlockhashWithExpiryBlockHeight,
} from "@solana/web3.js";
import { transactionSenderAndConfirmationWaiter } from "./lib/sender";

interface RateResponse {
  amountIn: number;
  amountOut: number;
  minAmountOut: number;
  currentPrice: number;
  executionPrice: number;
  priceImpact: number;
  fee: number;
  baseCurrency: {
    decimals: number;
    mint: string;
  };
  quoteCurrency: {
    decimals: number;
    mint: string;
  };
  platformFee: number;
  platformFeeUI: number;
  isJupiter: boolean;
  rawQuoteResponse: any;
}

interface SwapResponse {
  txn: string;
  isJupiter: boolean;
  rate: RateResponse;
  forceLegacy?: boolean;
}

class SolanaTracker {
  private readonly baseUrl: string;
  private readonly authHeaders: any;
  private readonly connection: Connection;
  private readonly keypair: Keypair;

  constructor(keypair: Keypair, rpc: string, baseUrl: string, authHeaders: any) {
    this.connection = new Connection(rpc);
    this.keypair = keypair;
    this.baseUrl = baseUrl;
    this.authHeaders = authHeaders;
  }

  async getRate(
    from: string,
    to: string,
    amount: number,
    slippage: number
  ): Promise<RateResponse> {
    const params = new URLSearchParams({
      from, to,
      amount: amount.toString(),
      slippage: slippage.toString(),
    });
    const url = `${this.baseUrl}/rate?${params}`;
    try {
      const response = await axios.get(url);
      return response.data as RateResponse;
    } catch (error) {
      console.error("Error fetching rate:", error);
      throw error;
    }
  }

  async getSwapInstructions(
    from: string,
    to: string,
    fromAmount: number,
    slippage: number,
    payer: string,
    priorityFee?: number,
    forceLegacy?: boolean
  ): Promise<SwapResponse> {
    const params = new URLSearchParams({
      from,
      to,
      fromAmount: fromAmount.toString(),
      slippage: slippage.toString(),
      payer,
      forceLegacy: forceLegacy ? "true" : "false",
    });
    if (priorityFee) {
      params.append("priorityFee", priorityFee.toString());
    }
    const url = `${this.baseUrl}/swap?${params}`;
    try {
      const response = await axios.get(url, { headers: this.authHeaders });
      response.data.forceLegacy = forceLegacy;
      return response.data as SwapResponse;
    } catch (error: any) {
      console.error("Error fetching swap instructions:", error.message, error);
      throw error;
    }
  }

  async performSwap(
    swapResponse: SwapResponse,
    options = {
      sendOptions: { skipPreflight: true },
      confirmationRetries: 30,
      confirmationRetryTimeout: 1000,
      lastValidBlockHeightBuffer: 150,
      resendInterval: 1000,
      confirmationCheckInterval: 1000,
      skipConfirmationCheck: false,
    }
  ): Promise<string> {
    let serializedTransactionBuffer: Buffer | Uint8Array;

    if (Buffer) {
      serializedTransactionBuffer = Buffer.from(swapResponse.txn, "base64");
    } else {
      const base64Str = swapResponse.txn;
      const binaryStr = atob(base64Str);
      const buffer = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        buffer[i] = binaryStr.charCodeAt(i);
      }
      serializedTransactionBuffer = buffer;
    }
    let txn: VersionedTransaction | Transaction;
   
    if (swapResponse.isJupiter && !swapResponse.forceLegacy) {
      txn = VersionedTransaction.deserialize(serializedTransactionBuffer);
      txn.sign([this.keypair]);
      
    } else {
      txn = Transaction.from(serializedTransactionBuffer);

      txn.sign(this.keypair);
   

      
    }
    const blockhash = await this.connection.getLatestBlockhash();
    const blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight = {
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
    };
    const txid = await transactionSenderAndConfirmationWaiter({
      connection: this.connection,
      serializedTransaction: txn.serialize() as Buffer,
      blockhashWithExpiryBlockHeight,
      options: options,
    });
    return txid.toString();
  }
}

export default SolanaTracker;