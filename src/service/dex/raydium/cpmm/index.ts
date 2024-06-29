import { ApiV3PoolInfoStandardItemCpmm, CurveCalculator, CREATE_CPMM_POOL_PROGRAM, DEV_CREATE_CPMM_POOL_PROGRAM, CpmmPoolInfoLayout, CpmmConfigInfoInterface } from '@raydium-io/raydium-sdk-v2';
import { Raydium, TxVersion, parseTokenAccountResp } from '@raydium-io/raydium-sdk-v2'
import { optimizedSendAndConfirmTransaction, wrapLegacyTx, add_mvx_and_ref_inx_fees, addMvxFeesInx } from '../../../util';
import { Connection, Keypair, PublicKey, VersionedTransaction, Transaction } from '@solana/web3.js'
import BigNumber from 'bignumber.js';
import Decimal from 'decimal.js'; // Add this line to import the 'Decimal' type
import dotenv from 'dotenv'; dotenv.config();
import bs58 from 'bs58'
import BN from 'bn.js'
import { cp } from 'fs';


export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

const VALID_PROGRAM_ID = new Set([CREATE_CPMM_POOL_PROGRAM.toBase58(), DEV_CREATE_CPMM_POOL_PROGRAM.toBase58()])
export const isValidCpmm = (id: string) => VALID_PROGRAM_ID.has(id)

export const txVersion = TxVersion.V0;

let raydium: Raydium | undefined;

export async function initSdk(wallet: Keypair, connection: Connection) {
  if (raydium) return raydium
  raydium = await Raydium.load({
    owner: wallet,
    connection,
    cluster: 'mainnet',
    disableFeatureCheck: true,
    disableLoadToken: false
  });
  return raydium
}

export async function raydium_cpmm_swap(
  connection: Connection,
  wallet: Keypair,
  tradeSide: 'buy' | 'sell',
  poolId: string,
  inputAmount: number,
  slippage: number,
  refObj: { refWallet: string, referral: boolean, refCommission: number },
): Promise<string | null> {

  const raydium = await initSdk(wallet, connection);
  const data = await raydium.api.fetchPoolById({ ids: poolId })
  const poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm;

  if (!isValidCpmm(poolInfo.programId)) throw new Error('target pool is not CPMM pool');
  const rpcData = await raydium.cpmm.getRpcPoolInfo(poolId, true);

  // swap pool mintA for mintB
  const swapResult = CurveCalculator.swap(new BN(inputAmount), rpcData.baseReserve, rpcData.quoteReserve, rpcData.configInfo!.tradeFeeRate);

  // range: 1 ~ 0.0001, means 100% ~ 0.01%e
  let { transaction } = await raydium.cpmm.swap({
    poolInfo, swapResult,
    slippage: slippage,
    baseIn: true,
  });

  const isBuy = tradeSide === 'buy';
  const solAmount = isBuy ? new BigNumber(swapResult.sourceAmountSwapped.toNumber()) : new BigNumber(swapResult.destinationAmountSwapped.toNumber());

  console.log("solAmount", solAmount.toNumber());

  if (refObj.refWallet && refObj.refCommission) {
    add_mvx_and_ref_inx_fees(wallet, refObj.refWallet, solAmount, refObj.refCommission);
  } else {
    addMvxFeesInx(wallet, solAmount);
  }

  let txSig: any = '';
  if (transaction instanceof Transaction) {
    const tx = new VersionedTransaction(wrapLegacyTx(transaction.instructions, wallet, (await connection.getLatestBlockhash()).blockhash));
    tx.sign([wallet]);
    txSig = await optimizedSendAndConfirmTransaction(
      tx, connection, (await connection.getLatestBlockhash()).blockhash, 2000
    );
  } else if (transaction instanceof VersionedTransaction) {
    txSig = await optimizedSendAndConfirmTransaction(
      transaction, connection, (await connection.getLatestBlockhash()).blockhash, 2000
    );
  }
  return txSig;
}

export async function getRayCpmmPoolKeys({ t1, t2, connection }: { t1: string, t2: string, connection: Connection }): Promise<PublicKey | undefined> {
  
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
  // console.log('A: ', CpmmPoolInfoLayout.offsetOf("mintA"));
  // console.log('B: ', CpmmPoolInfoLayout.offsetOf("mintB"));
  // console.log('span: ', CpmmPoolInfoLayout.span);
  let poolId = accounts && accounts[0] && accounts[0].pubkey;
  // console.log("CPMM poolId: ", poolId?.toBase58());
  return poolId;
}

export const fetchTokenAccountData = async (wallet:Keypair,connection:Connection) => {
  const solAccountResp = await connection.getAccountInfo(wallet.publicKey)
  const tokenAccountResp = await connection.getTokenAccountsByOwner(wallet.publicKey, { programId: TOKEN_PROGRAM_ID })
  const token2022Req = await connection.getTokenAccountsByOwner(wallet.publicKey, { programId: TOKEN_2022_PROGRAM_ID })
  const tokenAccountData = parseTokenAccountResp({
    owner: wallet.publicKey,
    solAccountResp,
    tokenAccountResp: {
      context: tokenAccountResp.context,
      value: [...tokenAccountResp.value, ...token2022Req.value],
    },
  })
  return tokenAccountData
}
//  getRayCpmmPoolKeys({t1:'5X1F16T5MRiAu4qPaFAaNA1oPx9VQzkpV5SzQcHsNUS9', t2:'So11111111111111111111111111111111111111112', connection:new Connection('https://moonvera-ams.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41')})


export async function getpoolDataCpmm(poolID: any, connection: any) : Promise<any | null>
{
  // const poolID = await getRayCpmmPoolKeys({t1:'5X1F16T5MRiAu4qPaFAaNA1oPx9VQzkpV5SzQcHsNUS9', t2:'So11111111111111111111111111111111111111112', connection:new Connection('https://moonvera-ams.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41')})
  const keypair = Keypair.fromSecretKey(bs58.decode(process.env.TEST_WALLET_PK!));
  const raydium = await initSdk(keypair,connection);
  if(!poolID) {
    console.error('Pool Cpmm not found')
    return null;
  }
  const data =  await raydium.api.fetchPoolById({ ids: String(poolID) })
  const poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm;
  // console.log('poolInfo', poolInfo);
  return poolInfo;
}
// getpoolDataCpmm()
/**
 * By default: sdk will automatically fetch token account data when need it or any sol balace changed.
 * if you want to handle token account by yourself, set token account data after init sdk
 * code below shows how to do it.
 * note: after call raydium.account.updateTokenAccount, raydium will not automatically fetch token account
 */

// raydium.account.updateTokenAccount(await fetchTokenAccountData())
// connection.onAccountChange(wallet.publicKey, async () => {
//     raydium!.account.updateTokenAccount(await fetchTokenAccountData())
// })