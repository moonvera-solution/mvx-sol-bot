import Client from "@triton-one/yellowstone-grpc";
import { Server as WebSocketServer } from 'ws';
import WebSocket from 'ws';
import url from 'url';
import {
  LIQUIDITY_STATE_LAYOUT_V4,
  MARKET_STATE_LAYOUT_V3,
  ApiPoolInfoV4
} from "@raydium-io/raydium-sdk";

const NODE_URL = 'https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41';
const headers = { headers: { 'Content-Type': 'application/json', } };
import { clusterApiUrl, Connection, PublicKey, GetProgramAccountsResponse } from "@solana/web3.js";
import { formatAmmKeysById } from '../raydium-utils/formatAmmKeysById';
const wss = new WebSocketServer({ port: 8085 });
const clients = new Map();

async function subNewAmmPool(rpcUrl: string, rpcToken: string) {
  const createPoolFeeAccount = '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5'; // only mainnet, dev pls use 3XMrhbv989VxAMi3DErLV9eJht1pHppW5LbKxe9fkEFR
  const client = new Client(rpcUrl, rpcToken);
  const rpcConnInfo = await client.subscribe();

  let request = 0;
  wss.on('connection', (ws: any, req: any) => {
    const id = new url.URL(req.url, `ws://${req.headers.host}`).searchParams.get('id');
    clients.set(id, ws);

    ws.on('close', () => {
      clients.delete(id);
    });
  });

  rpcConnInfo.on("data", data => {
    request++
    const [id, client] = clients.entries().next().value || [];

    if (client && client.readyState === WebSocket.OPEN) {
      console.log(id, " handle request ", request)
      // client.send(data);
      client.send(JSON.stringify(data, null, 2));
      clients.delete(id);
    } else {
      console.log("No client for request ", request);
    }
  });

  await new Promise<void>((resolve, reject) => {
    if (rpcConnInfo === undefined) throw Error('rpc conn error')
    rpcConnInfo.write({
      slots: {},
      accounts: {},
      transactions: {
        transactionsSubKey: {
          accountInclude: [createPoolFeeAccount],
          accountExclude: [],
          accountRequired: []
        }
      },
      blocks: {},
      blocksMeta: {},
      accountsDataSlice: [],
      entry: {},
      commitment: 1
    }, (err: Error) => {
      if (err === null || err === undefined) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).catch((reason) => {
    console.error(reason);
    throw reason;
  });
}
async function radiumPools() {
  try {
    subNewAmmPool(
      'https://moonvera-pit.rpcpool.com',
      '6eb499c8-2570-43ab-bad8-fdf1c63b2b41'
    );
  } catch (e: any) {
    console.error("Error: ", e.message);
  }
}

// radiumPools();

 async function firstTest(){
  const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const MY_TOKEN_MINT_ADDRESS = "FvVDc6gZmYho6DLLuJ3ptHS6rxb797Cxf1insiUnu2BL";
  const connection = new Connection('https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41', 'processed');
  const accounts = await connection.getProgramAccounts(
    TOKEN_PROGRAM_ID, // new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
    {
      dataSlice: {
        offset: 0, // number of bytes
        length: 0, // number of bytes
      },
      filters: [
        {
          dataSize: 165, // number of bytes
        },
        {
          memcmp: {
            offset: 0, // number of bytes
            bytes: MY_TOKEN_MINT_ADDRESS, // base58 encoded string
          },
        },
      ],
    }
  );
  console.log(
    `Found ${accounts.length} token account(s) for mint ${MY_TOKEN_MINT_ADDRESS}`
  );
  console.log(accounts);
}
const axios = require('axios');
const connection = new Connection('https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41', 'processed');

const baseMint = new PublicKey('FvVDc6gZmYho6DLLuJ3ptHS6rxb797Cxf1insiUnu2BL');

export function getPoolParams(logMessages: any) {
  const regex = /InitializeInstruction2\s*\{\s*nonce:\s*(\d+),\s*open_time:\s*(\d+),\s*init_pc_amount:\s*(\d+),\s*init_coin_amount:\s*(\d+)\s*\}/;
  for (const log of logMessages) {
    const match = log.match(regex);
    if (match != null) {
      return {
        nonce: match[1],
        open_time: match[2],
        init_quote_amount: match[3],
        init_coin_amount: match[4]
      }
    }
  }
}


const commitment = "confirmed"
const SERUM_MARKET = new PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin');
const OPENBOOK_MARKET = new PublicKey('srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX');

const AMMV4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
const quoteMint = new PublicKey('So11111111111111111111111111111111111111112');

// InitializeInstruction2 Ix of deploy must include time
// https://solana.stackexchange.com/questions/8608/faster-method-to-retrieve-pool-keys-raydium


// Define a function to fetch and decode OpenBook accounts

function getScheduleFromInx(ammId: string) {
  axios.post(NODE_URL,
    {
      id: 324,
      jsonrpc: '2.0',
      method: 'getSignaturesForAddress',
      params: [ammId, { "limit": 1000, "encoding": "json", "maxSupportedTransactionVersion": 0 }]
    }
    , headers)
    .then((response: any) => {
      const res = JSON.parse((JSON.stringify(response.data)));
      console.log("signature:", res.result.length)
      const sig = res.result[res.result.length - 1].signature; // check fist tx
      axios.post(NODE_URL,
        {
          "jsonrpc": "2.0",
          "id": 1,
          "method": "getTransaction",
          "params": [
            `${sig.toString()}`,
            { "encoding": "json", "maxSupportedTransactionVersion": 0 }
          ]
        }, headers).then((response: any) => {
          const res2 = JSON.parse(JSON.stringify(response.data));
          const logs = res2.result.meta.logMessages;
          const poolSchedule = getPoolParams(logs);
          console.log('poolSchedule:: ', poolSchedule);
        }).catch((error: any) => {
          console.error(error);
        });

    })
    .catch((error: any) => {
      console.error(error);
    });
}

export async function getRayPoolKeys(shitcoin: string): Promise<ApiPoolInfoV4>  {
  const commitment = "confirmed";
  const connection = new Connection('https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41', commitment);
  const AMMV4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
  const baseMint = new PublicKey(shitcoin);
  const quoteMint = new PublicKey('So11111111111111111111111111111111111111112');
  const accounts = await connection.getProgramAccounts(
    AMMV4,
    {
      commitment,
      filters: [
        { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
        {
          memcmp: {
            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint"),
            bytes: baseMint.toBase58(),
          },
        },
        {
          memcmp: {
            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint"),
            bytes: quoteMint.toBase58(),
          },
        },
      ],
    }
  );

  let ammId;
  let keys:any;
  while (keys == undefined) {
    ammId = accounts && accounts[0] && accounts[0].pubkey;
    keys = ammId && await formatAmmKeysById(ammId.toString());
  }
  console.log('keys', keys.baseMint);
  return keys;
}
// getRayPoolKeys('E83N1Lj9ebLyDKe5unwtzVrUzUaFKpXBdn6tYUyTVEwJ').then((res) => { console.log('res',res)});
/**
 *   console.log(
    'span: ', (LIQUIDITY_STATE_LAYOUT_V4.span),
    'memcmp:{base:', LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint"),
    'memcmp:{quote:', LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint")
  );

 */

  // if using baseMint theres risk of not finding 
  export async function getPoolScheduleFromHistory(ammId: string) { 
    let transactionList = await connection.getSignaturesForAddress(new PublicKey(ammId), { limit: 1000 }, 'confirmed');
    let signatureList = transactionList.map(transaction => transaction.signature);
  
    for await (const sig of signatureList) {
      const txs = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
      if (txs!.meta!.logMessages) {
        const poolSchedule = getPoolParams(txs!.meta!.logMessages);
        if (poolSchedule) {
          console.log('poolSchedule:: ', poolSchedule);
          return poolSchedule;
        }
      }
    }
  }

