import { ApiV3PoolInfoStandardItemCpmm, CurveCalculator, CREATE_CPMM_POOL_PROGRAM, DEV_CREATE_CPMM_POOL_PROGRAM, CpmmPoolInfoLayout, CpmmConfigInfoInterface } from '@raydium-io/raydium-sdk-v2';
import { Raydium, TxVersion, parseTokenAccountResp, CpmmKeys } from '@raydium-io/raydium-sdk-v2'
import { optimizedSendAndConfirmTransaction, wrapLegacyTx, add_mvx_and_ref_inx_fees, addMvxFeesInx } from '../../../util';
import { Connection, Keypair, PublicKey, VersionedTransaction, Transaction, TransactionMessage, AddressLookupTableAccount } from '@solana/web3.js'
import BigNumber from 'bignumber.js';
import dotenv from 'dotenv'; dotenv.config();
import bs58 from 'bs58'
import BN from 'bn.js'
import { TransactionInstruction } from '@solana/web3.js';


export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

const VALID_PROGRAM_ID = new Set([CREATE_CPMM_POOL_PROGRAM.toBase58(), DEV_CREATE_CPMM_POOL_PROGRAM.toBase58()])
export const isValidCpmm = (id: string) => VALID_PROGRAM_ID.has(id)

export const txVersion = TxVersion.V0;

let raydium: Raydium | undefined;

export async function initSdk(wallet: Keypair, connection: Connection) {
  if (raydium) return raydium
  console.log("--c>, ", wallet.publicKey.toBase58());
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
  ctx: any
): Promise<string | null> {
  let poolKeys: CpmmKeys | undefined
  const raydium = await initSdk(wallet, connection);
  const data = await raydium.api.fetchPoolById({ ids: poolId })
  const poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm;
  const inputMint = tradeSide == 'buy' ? poolInfo.mintA.address : poolInfo.mintB.address;
  const baseIn = inputMint === poolInfo.mintA.address
  if (!isValidCpmm(poolInfo.programId)) throw new Error('target pool is not CPMM pool');
  const rpcData = await raydium.cpmm.getRpcPoolInfo(poolId, true);
  // console.log('inputAmount', inputAmount);
  // console.log('poolInfo', poolInfo);  
  // swap pool mintA for mintB
  const swapResult = CurveCalculator.swap(
    new BN(inputAmount),
    baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
    baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
    rpcData.configInfo!.tradeFeeRate
  )
  // range: 1 ~ 0.0001, means 100% ~ 0.01%e
  let { transaction } = await raydium.cpmm.swap({
    poolInfo,
    poolKeys,
    swapResult,
    slippage: 0,
    baseIn,
    computeBudgetConfig: {
      microLamports: ctx.session.customPriorityFee * 1e9,
    }
  });

  const solAmount = tradeSide == 'buy' ? new BigNumber(swapResult.sourceAmountSwapped.toNumber()) : new BigNumber(swapResult.destinationAmountSwapped.toNumber());
  if (tradeSide == 'sell') {
    ctx.session.CpmmSolExtracted = solAmount
  }


  let txSig: any = '';
  if (transaction instanceof Transaction) {

    transaction.instructions.push(...addMvxFeesInx(wallet, solAmount));
    addMvxFeesInx(wallet, solAmount);
    const tx = new VersionedTransaction(wrapLegacyTx(transaction.instructions, wallet, (await connection.getLatestBlockhash()).blockhash));
    tx.sign([wallet]);
    txSig = await optimizedSendAndConfirmTransaction(
      tx, connection, (await connection.getLatestBlockhash()).blockhash, 50
    );
  } else if (transaction instanceof VersionedTransaction) {
    const addressLookupTableAccounts = await Promise.all(
      transaction.message.addressTableLookups.map(async (lookup) => {
        return new AddressLookupTableAccount({
          key: lookup.accountKey,
          state: AddressLookupTableAccount.deserialize(await connection.getAccountInfo(lookup.accountKey).then((res) => res!.data)),
        })
      }));
    var message = TransactionMessage.decompile(transaction.message, { addressLookupTableAccounts: addressLookupTableAccounts })

 
      message.instructions.push(...addMvxFeesInx(wallet, solAmount));
      addMvxFeesInx(wallet, solAmount);

    txSig = await optimizedSendAndConfirmTransaction(
      new VersionedTransaction(transaction.message), connection, (await connection.getLatestBlockhash()).blockhash, 50
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

export const fetchTokenAccountData = async (wallet: Keypair, connection: Connection) => {
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
  return tokenAccountData;
}

//  getRayCpmmPoolKeys({t1:'5X1F16T5MRiAu4qPaFAaNA1oPx9VQzkpV5SzQcHsNUS9', t2:'So11111111111111111111111111111111111111112', connection:new Connection('https://moonvera-ams.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41')})


export async function getpoolDataCpmm(wallet: Keypair, poolID: any, connection: any): Promise<ApiV3PoolInfoStandardItemCpmm> {
  // const poolID = await getRayCpmmPoolKeys({t1:'5X1F16T5MRiAu4qPaFAaNA1oPx9VQzkpV5SzQcHsNUS9', t2:'So11111111111111111111111111111111111111112', connection:new Connection('https://moonvera-ams.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41')})
  // console.log("wallet:: ",wallet);
  const raydium = await initSdk(wallet, connection);
  if (!poolID) {
    console.error('Pool Cpmm not found')
    throw new Error('Cpmm pool not found')
  }
  const data = await raydium.api.fetchPoolById({ ids: String(poolID) })
  const poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm;
  // console.log('poolInfo --c>', poolInfo);
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