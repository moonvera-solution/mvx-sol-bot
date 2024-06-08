import { LIQUIDITY_VERSION_TO_STATE_LAYOUT, ApiV3PoolInfoStandardItemCpmm, CurveCalculator, CREATE_CPMM_POOL_PROGRAM, DEV_CREATE_CPMM_POOL_PROGRAM, CpmmPoolInfoLayout } from '@raydium-io/raydium-sdk-v2';
import { ApiPoolInfoV4, LIQUIDITY_STATE_LAYOUT_V4, Liquidity, LiquidityPoolKeys, MARKET_STATE_LAYOUT_V3, Market, SPL_MINT_LAYOUT, jsonInfo2PoolKeys } from '@raydium-io/raydium-sdk';

import { Raydium, TxVersion, parseTokenAccountResp } from '@raydium-io/raydium-sdk-v2'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import dotenv from 'dotenv'; dotenv.config();
import bs58 from 'bs58'
import BN from 'bn.js'

export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

const VALID_PROGRAM_ID = new Set([CREATE_CPMM_POOL_PROGRAM.toBase58(), DEV_CREATE_CPMM_POOL_PROGRAM.toBase58()])
export const isValidCpmm = (id: string) => VALID_PROGRAM_ID.has(id)

export const owner: Keypair = Keypair.fromSecretKey(bs58.decode(process.env.TEST_WALLET_PK as string))
const connection = new Connection(`${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`);
export const txVersion = TxVersion.V0;

let raydium: Raydium | undefined;

export const initSdk = async (params?: { loadToken?: boolean }) => {
  if (raydium) return raydium
  raydium = await Raydium.load({
    owner,
    connection,
    cluster: 'mainnet',
    disableFeatureCheck: true,
    disableLoadToken: !params?.loadToken
  });


  const tokens = await raydium.token.tokenList;
  console.log('tokens:', tokens)
  /**
   * By default: sdk will automatically fetch token account data when need it or any sol balace changed.
   * if you want to handle token account by yourself, set token account data after init sdk
   * code below shows how to do it.
   * note: after call raydium.account.updateTokenAccount, raydium will not automatically fetch token account
   */

  // raydium.account.updateTokenAccount(await fetchTokenAccountData())
  // connection.onAccountChange(owner.publicKey, async () => {
  //     raydium!.account.updateTokenAccount(await fetchTokenAccountData())
  // })

  return raydium
}

export const fetchTokenAccountData = async () => {
  const solAccountResp = await connection.getAccountInfo(owner.publicKey)
  const tokenAccountResp = await connection.getTokenAccountsByOwner(owner.publicKey, { programId: TOKEN_PROGRAM_ID })
  const token2022Req = await connection.getTokenAccountsByOwner(owner.publicKey, { programId: TOKEN_2022_PROGRAM_ID })
  const tokenAccountData = parseTokenAccountResp({
    owner: owner.publicKey,
    solAccountResp,
    tokenAccountResp: {
      context: tokenAccountResp.context,
      value: [...tokenAccountResp.value, ...token2022Req.value],
    },
  })
  return tokenAccountData
}

export const fetchRpcPoolInfo = async (poolId: PublicKey) => {
  const raydium = await initSdk()
  const res = await raydium.cpmm.getRpcPoolInfo(poolId.toBase58())

  const pool1Info = res;

  console.log('SOL-RAY pool price:', pool1Info.poolPrice)
  console.log('cpmm pool infos:', res)
}

export const swap = async (poolId:string) => {
  const raydium = await initSdk()
  const data = await raydium.api.fetchPoolById({ ids: poolId })
  const poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm;

  if (!isValidCpmm(poolInfo.programId)) throw new Error('target pool is not CPMM pool');
  console.log('poolInfo:', poolInfo)  
  const rpcData = await raydium.cpmm.getRpcPoolInfo(poolId, true);

  const inputAmount = new BN(100);

  // swap pool mintA for mintB
  const swapResult = CurveCalculator.swap(
    inputAmount,
    rpcData.baseReserve,
    rpcData.quoteReserve,
    rpcData.configInfo!.tradeFeeRate
  )
  /**
   * swapResult.sourceAmountSwapped -> input amount
   * swapResult.destinationAmountSwapped -> output amount
   * swapResult.tradeFee -> this swap fee, charge input mint
   */

  const { execute } = await raydium.cpmm.swap({
    poolInfo,
    swapResult,
    slippage: 0.1, // range: 1 ~ 0.0001, means 100% ~ 0.01%
    baseIn: true,
  });
  const { txId } = await execute();
  console.log(`swapped: ${poolInfo.mintA.symbol} to ${poolInfo.mintB.symbol}:`, { txId });
}

async function getRayCpmmPoolKeys({ t1, t2, connection }: { t1: string, t2: string, connection: Connection })
: Promise<PublicKey | undefined>{
  const commitment = "processed";
  const RAYDIUM_CPMM = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');

  const baseMint = new PublicKey(t1);
  const quoteMint = new PublicKey(t2);

  const accounts = await connection.getProgramAccounts(
    RAYDIUM_CPMM,
    {
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
    }
  );

  let poolId = accounts && accounts[0] && accounts[0].pubkey;
  console.log("CPMM poolId: ", poolId?.toBase58());
  return poolId;
}

// asert pool id = 69KBRQa5zfCMed1Z3spGkUcaX1UXS8nkWhvjruqHUJ4N
async function test() {
  const poolId = await getRayCpmmPoolKeys({
    t1: '5X1F16T5MRiAu4qPaFAaNA1oPx9VQzkpV5SzQcHsNUS9',
    t2: 'So11111111111111111111111111111111111111112',
    connection
  });
  await swap(poolId!.toBase58());
}

/** uncomment code below to execute */
// test().then(res => console.log("done...")).catch(err => console.error(err));