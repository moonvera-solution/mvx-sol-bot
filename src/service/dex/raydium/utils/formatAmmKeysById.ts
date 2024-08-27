import {
  ApiPoolInfoV4,
  LIQUIDITY_STATE_LAYOUT_V4,
  Liquidity,
  LiquidityPoolKeys,
  MARKET_STATE_LAYOUT_V3,
  Market,
  SPL_MINT_LAYOUT,
  jsonInfo2PoolKeys,
} from "@raydium-io/raydium-sdk";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { CONNECTION, SOL_ADDRESS } from "../../../../config";
import bs58 from "bs58";
import { initSdk } from "../cpmm";
import { promises } from "fs";
import { rpc } from "@coral-xyz/anchor/dist/cjs/utils";
import {
  CpmmPoolInfoLayout,
  ApiV3PoolInfoStandardItemCpmm,
  ApiV3Token,
  CpmmKeys,
} from "@raydium-io/raydium-sdk-v2";
import { getpoolDataCpmm } from "../cpmm";

export async function fetchPoolSchedule(keys: any, connection: Connection) {
  let poolKeys = jsonInfo2PoolKeys(keys) as LiquidityPoolKeys;

  // let testime = await Liquidity.fetchInfo({ connection, poolKeys });

  return await Liquidity.fetchInfo({ connection, poolKeys });
}

export async function getRayPoolKeys(ctx: any, shitcoin: string) {
  const connection = CONNECTION;
  const quoteMint = "So11111111111111111111111111111111111111112";

  const walletKeyPair = Keypair.fromSecretKey(
    bs58.decode(
      ctx.session.portfolio.wallets[ctx.session.portfolio.activeWalletIndex]
        .secretKey
    )
  );
  // console.log("userWallet --c>", walletKeyPair.publicKey.toBase58());

  // let keys: any;
  let cpmmKeys: any;
  let AmmV4Keys: any;
  try {
    let { isCpmmPool, keys } = await _getRayPoolKeys({
      t1: shitcoin,
      t2: quoteMint,
      connection,
      userWallet: walletKeyPair,
    });
 
    if (isCpmmPool) {
      console.log('isCpmmPool:', isCpmmPool);
      cpmmKeys = keys ;
      // console.log("cpmmKeys here", cpmmKeys);
      // ctx.session.poolTime = Number(cpmmKeys.openTime);
      ctx.session.cpmmPoolInfo = cpmmKeys;
      ctx.session.isCpmmPool = true;
      return cpmmKeys;
    } else {
      AmmV4Keys = keys;
      if (AmmV4Keys) {
        ctx.session.isCpmmPool = false;
        console.log("AmmV4Keys here");
        return AmmV4Keys.id;
      }
    }
  
  } catch (e) {
    console.log(e);
  }
}

export async function getAmmV4PoolKeys(ctx: any) {
  const connection = CONNECTION;
  const activeWalletIndexIdx: number = ctx.session.portfolio.activeWalletIndex;
  const userSecretKey = ctx.session.portfolio.wallets[activeWalletIndexIdx].secretKey;

  const raydium = await initSdk(
    Keypair.fromSecretKey(bs58.decode(String(userSecretKey))),
    connection
  );
  // console.log('ctx.session.activeTradingPoolId:', ctx.session.activeTradingPoolId);
  const data = await raydium.liquidity.getPoolInfoFromRpc({poolId: ctx.session.activeTradingPoolId});
  const rpcData = data.poolRpcData;
  const poolKeys = data.poolKeys;
  const poolInfo = data.poolInfo;
  // console.log('poolKeys:', poolKeys);

  const _quoteMint = rpcData.quoteMint;
  const _baseMint = rpcData.baseMint;
  const _baseVault = rpcData.baseVault;
  const _quoteVault = rpcData.quoteVault;
  const _baseDecimals = rpcData.baseDecimal;
  const _quoteDecimals = rpcData.quoteDecimal;
  const _baseReserve = rpcData.baseReserve;
  const _quoteReserve = rpcData.quoteReserve;
  const _marketQuoteVault = poolKeys.marketQuoteVault;
  const _marketBaseVault = poolKeys.marketBaseVault;
  const modifiedPoolKeys = { ...poolKeys };
  const modifiedPoolInfo = { ...poolInfo };


  
  // check if the baseMint is SOL
  if (rpcData.baseMint.toBase58() == SOL_ADDRESS) {
    console.log("baseMint is SOL");
    rpcData.baseMint = _quoteMint;
    rpcData.quoteMint = _baseMint;
    rpcData.quoteVault = _baseVault;
    rpcData.baseVault = _quoteVault;
    rpcData.baseDecimal = _quoteDecimals;
    rpcData.quoteDecimal = _baseDecimals;
    rpcData.baseReserve = _quoteReserve;
    rpcData.quoteReserve = _baseReserve;
   // Swap modifiedPoolKeys properties
   modifiedPoolKeys.marketQuoteVault = _marketBaseVault;
   modifiedPoolKeys.marketBaseVault = _marketQuoteVault;

   // Swap MintA and MintB in the modified poolKeys
   modifiedPoolKeys.mintA = poolKeys.mintB;
   modifiedPoolKeys.mintB = poolKeys.mintA;

   modifiedPoolInfo.mintA = poolInfo.mintB;
   modifiedPoolInfo.mintB = poolInfo.mintA;
   modifiedPoolInfo.mintAmountA = poolInfo.mintAmountB;
   modifiedPoolInfo.mintAmountB = poolInfo.mintAmountA;
  //  modifiedPoolInfo.feeRate = 0;

  }


  // Serve the data to the session
  ctx.session.AmmPoolKeys = modifiedPoolKeys;
  ctx.session.AmmRpcData = rpcData;
  ctx.session.AmmPoolInfo = modifiedPoolInfo;
  
  // console.log("AmmPoolKeys:", modifiedPoolKeys);
  // console.log("AmmRpcData:", rpcData);
  return { poolKeys: modifiedPoolKeys , rpcData, poolInfo: modifiedPoolInfo };
}
async function _getRayPoolKeys({
  t1,
  t2,
  connection,
  userWallet,
}: {
  t1: string;
  t2: string;
  connection: Connection;
  userWallet: Keypair;
}): Promise<{
  isCpmmPool: boolean;
  keys: CpmmKeys | any;
}> {
  const commitment = "processed";
  const AMMV4 = new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");
  let baseMint = new PublicKey(t1);
  let quoteMint = new PublicKey(t2);
  let isCpmmPool = false;

  let accounts = await connection.getProgramAccounts(AMMV4, {
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
  });

  if (accounts.length < 1 && quoteMint.toBase58() == t2) {
    baseMint = new PublicKey(t2);
    quoteMint = new PublicKey(t1);
    isCpmmPool = false;
    accounts = await connection.getProgramAccounts(AMMV4, {
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
    });
  }
  if (accounts.length < 1) {
    const RAYDIUM_CPMM = new PublicKey(
      "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
    );

    isCpmmPool = true;
    accounts = await connection.getProgramAccounts(RAYDIUM_CPMM, {
      commitment,
      filters: [
        { dataSize: CpmmPoolInfoLayout.span },
        {
          memcmp: {
            offset: CpmmPoolInfoLayout.offsetOf("mintB"),
            bytes: baseMint.toBase58(),
          },
        },
        {
          memcmp: {
            offset: CpmmPoolInfoLayout.offsetOf("mintA"),
            bytes: quoteMint.toBase58(),
          },
        },
      ],
    });
    //The Cpmm might be reversed at some points
    if(accounts.length < 1){
      accounts = await connection.getProgramAccounts(RAYDIUM_CPMM, {
        commitment,
        filters: [
          { dataSize: CpmmPoolInfoLayout.span },
          {
            memcmp: {
              offset: CpmmPoolInfoLayout.offsetOf("mintA"),
              bytes: baseMint.toBase58(),
            },
          },
          {
            memcmp: {
              offset: CpmmPoolInfoLayout.offsetOf("mintB"),
              bytes: quoteMint.toBase58(),
            },
          },
        ],
      });
    }
    // console.log("accountsCpmm:", accounts);
  }

  const ammId = accounts && accounts[0] && accounts[0].pubkey;
  let keys: any;

  // ammid exists and keys still null
  while (ammId && keys == undefined) {
    keys = isCpmmPool
      ? await getpoolDataCpmm(userWallet, ammId.toString(), connection)
      : await formatAmmKeysById(ammId.toString(), connection);
  }

  return { isCpmmPool, keys };
}

export async function formatAmmKeysById(
  id: string,
  connection: Connection
): Promise<ApiPoolInfoV4> {
  const account = await connection.getAccountInfo(
    new PublicKey(id),
    "processed"
  );

  if (account === null) throw Error(" get id info error ");
  const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account.data);

  const marketId = info.marketId;

  const marketAccount = await connection.getAccountInfo(marketId);

  if (marketAccount === null) throw Error(" get market info error");
  const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);

  const lpMint = info.lpMint;
  let lpMintAccount = await connection.getAccountInfo(lpMint);
  let attempts = 0;
  const maxAttempts = 500;
  const delay = 500;
  while (lpMintAccount === null && attempts < maxAttempts) {
    console.log(
      `Attempt ${attempts + 1}: LP Mint info not found. Retrying in ${
        delay / 1000
      } seconds...`
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    lpMintAccount = await connection.getAccountInfo(lpMint);
    attempts++;
  }
  if (lpMintAccount === null) {
    throw Error(" get lp mint info error");
  }
  const lpMintInfo = SPL_MINT_LAYOUT.decode(lpMintAccount.data);
  const authority = Liquidity.getAssociatedAuthority({
    programId: account.owner,
  }).publicKey.toString();
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
    authority: Liquidity.getAssociatedAuthority({
      programId: account.owner,
    }).publicKey.toString(),
    openOrders: info.openOrders.toString(),
    targetOrders: info.targetOrders.toString(),
    baseVault: info.baseVault.toString(),
    quoteVault: info.quoteVault.toString(),
    withdrawQueue: info.withdrawQueue.toString(),
    lpVault: info.lpVault.toString(),
    marketVersion: 3,
    marketProgramId: info.marketProgramId.toString(),
    marketId: info.marketId.toString(),
    marketAuthority: Market.getAssociatedAuthority({
      programId: info.marketProgramId,
      marketId: info.marketId,
    }).publicKey.toString(),
    marketBaseVault: marketInfo.baseVault.toString(),
    marketQuoteVault: marketInfo.quoteVault.toString(),
    marketBids: marketInfo.bids.toString(),
    marketAsks: marketInfo.asks.toString(),
    marketEventQueue: marketInfo.eventQueue.toString(),
    lookupTableAccount: PublicKey.default.toString(),
  };
}
