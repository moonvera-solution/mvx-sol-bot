import {
  ApiPoolInfoV4,
  LIQUIDITY_STATE_LAYOUT_V4,
  Liquidity,
  LiquidityPoolKeys,
  MARKET_STATE_LAYOUT_V3,
  Market,
  SPL_MINT_LAYOUT,
  jsonInfo2PoolKeys
} from '@raydium-io/raydium-sdk';
import {
  PublicKey, Connection
} from '@solana/web3.js';
import { RAYDIUM_POOL_TYPE } from '../../../../service/util/types';

export async function getRayPoolKeys(ctx: any, shitcoin: string) {
  const connection = new Connection(`${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`);
  const quoteMint = 'So11111111111111111111111111111111111111112';
  let keys = await _getRayPoolKeys({ t1: shitcoin, t2: quoteMint, connection });
  let rayPoolKeys = keys as RAYDIUM_POOL_TYPE;

  let poolKeys = jsonInfo2PoolKeys(rayPoolKeys) as LiquidityPoolKeys;

  let liqInfo = Liquidity.fetchInfo({ connection, poolKeys })
  ctx.session.poolTime = (await liqInfo).startTime.toNumber() * 1000;
  if (!keys) {
    keys = await _getRayPoolKeys({ t1: quoteMint, t2: shitcoin, connection });
    const rayPoolKeys = keys as RAYDIUM_POOL_TYPE;

    const poolKeys = jsonInfo2PoolKeys(rayPoolKeys) as LiquidityPoolKeys;

    let liqInfo = Liquidity.fetchInfo({ connection, poolKeys })
    ctx.session.poolTime = (await liqInfo).startTime.toNumber() * 1000;
    console.log('liqInfo', (await liqInfo).startTime)
    let _quoteMint = keys.quoteMint;
    let _baseMint = keys.baseMint;
    let _baseVault = keys.baseVault;
    let _quoteVault = keys.quoteVault;
    let _baseDecimals = keys.baseDecimals;
    let _quoteDecimals = keys.quoteDecimals;
    let _marketQuoteVault = keys.marketQuoteVault;
    let _marketBaseVault = keys.marketBaseVault;

    keys.baseMint = _quoteMint;
    keys.quoteMint = _baseMint;
    keys.quoteVault = _baseVault;
    keys.baseVault = _quoteVault;
    keys.quoteDecimals = _baseDecimals;
    keys.baseDecimals = _quoteDecimals;
    keys.marketBaseVault = _marketQuoteVault;
    keys.marketQuoteVault = _marketBaseVault;
  }
  console.log('keys', keys);
  return keys;
}

async function _getRayPoolKeys({ t1, t2, connection }: { t1: string, t2: string, connection: Connection }) {
  const commitment = "processed";
  const AMMV4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
  const baseMint = new PublicKey(t1);
  const quoteMint = new PublicKey(t2);
  console.log(t1, t2)

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


  const ammId = accounts && accounts[0] && accounts[0].pubkey;
  let keys: any = null;
  // ammid exists and keys still null
  while (ammId && keys == undefined) {
    keys = await formatAmmKeysById(ammId.toString(), connection);
  }
  return keys;
}


export async function formatAmmKeysById(id: string, connection: Connection): Promise<ApiPoolInfoV4> {
  const account = await connection.getAccountInfo(new PublicKey(id), 'processed')
  
  if (account === null) throw Error(' get id info error ')
  const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account.data)

  const marketId = info.marketId

  const marketAccount = await connection.getAccountInfo(marketId)

  if (marketAccount === null) throw Error(' get market info error')
  const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data)

  const lpMint = info.lpMint
  let lpMintAccount = await connection.getAccountInfo(lpMint)
  let attempts = 0;
  const maxAttempts = 500;
  const delay = 500;
  while (lpMintAccount === null && attempts < maxAttempts) {
    console.log(`Attempt ${attempts + 1}: LP Mint info not found. Retrying in ${delay / 1000} seconds...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    lpMintAccount = await connection.getAccountInfo(lpMint);
    attempts++;
  }
  if (lpMintAccount === null) {
    throw Error(' get lp mint info error')
  }
  const lpMintInfo = SPL_MINT_LAYOUT.decode(lpMintAccount.data);
  const authority = Liquidity.getAssociatedAuthority({ programId: account.owner }).publicKey.toString();
  // console.log('id:', id, 'authority:', authority, 'lpMint:', lpMint.toString(), 'lpMintInfo:', lpMintInfo.decimals, 'marketId:', marketId.toString(), 'marketInfo:', marketInfo.baseVault.toString(), marketInfo.quoteVault.toString(), marketInfo.bids.toString(), marketInfo.asks.toString(), marketInfo.eventQueue.toString());
  return {
    id,
    baseMint: info.baseMint.toString(),
    quoteMint: info.quoteMint.toString(),
    lpMint: info.lpMint.toString(),
    baseDecimals: info.baseDecimal.toNumber(),
    quoteDecimals: info.quoteDecimal.toNumber(),
    lpDecimals: lpMintInfo.decimals,
    version: 4,
    programId: account.owner.toString(),
    authority: Liquidity.getAssociatedAuthority({ programId: account.owner }).publicKey.toString(),
    openOrders: info.openOrders.toString(),
    targetOrders: info.targetOrders.toString(),
    baseVault: info.baseVault.toString(),
    quoteVault: info.quoteVault.toString(),
    withdrawQueue: info.withdrawQueue.toString(),
    lpVault: info.lpVault.toString(),
    marketVersion: 3,
    marketProgramId: info.marketProgramId.toString(),
    marketId: info.marketId.toString(),
    marketAuthority: Market.getAssociatedAuthority({ programId: info.marketProgramId, marketId: info.marketId }).publicKey.toString(),
    marketBaseVault: marketInfo.baseVault.toString(),
    marketQuoteVault: marketInfo.quoteVault.toString(),
    marketBids: marketInfo.bids.toString(),
    marketAsks: marketInfo.asks.toString(),
    marketEventQueue: marketInfo.eventQueue.toString(),
    lookupTableAccount: PublicKey.default.toString()
  }
}