import {
    Keypair,
    PublicKey,
    ComputeBudgetProgram,
    SystemProgram,
    Transaction, AddressLookupTableProgram,
    Connection, TransactionMessage, VersionedTransaction, AddressLookupTableAccount
} from "@solana/web3.js";
import {
    AnchorProvider,
    BN,
    Program,
    Wallet,
    getProvider,
} from "@coral-xyz/anchor";
import { searcherClient, getRandomTipAccount ,sendJitoBundleFromIx} from '../../jito/index';
import { MintUtils } from "./mint_utils";
import { OpenBookV2Client, OpenBookClientOptions } from "@openbook-dex/openbook-v2";
import { sign } from "crypto";

const  wallet:any = '';

export const programId = new PublicKey(
    "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX"
);

//   import { RPC, authority, connection, programId } from "./utils";

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const RPC = 'https://moonvera-maind5f-ee34.mainnet.rpcpool.com/c5a0f0bd-88fa-4693-9209-ce3b4fc9ef18'
    const walletFromWallet = new Wallet(wallet);
    const connection = new Connection(RPC, {
        commitment: "finalized",
        confirmTransactionInitialTimeout: 30000,
    });

    const provider = new AnchorProvider(connection, walletFromWallet, {
        commitment: "confirmed",
    });
    const client = new OpenBookV2Client(provider, programId, {
        prioritizationFee: 10000
    });

    console.log(
        "starting with balance: ",
        await provider.connection.getBalance(wallet.publicKey)
    );

    const nbMints = 2;
    let mintUtils = new MintUtils(provider.connection, wallet);
    let mints = await mintUtils.createMints(nbMints); // replace to get RAW instruction 

    // SystemProgram.createAccount({
    //     fromPubkey: payer.publicKey,
    //     newAccountPubkey: keypair.publicKey,
    //     space: MINT_SIZE,
    //     lamports,
    //     programId,
    // }),
    // createInitializeMint2Instruction(keypair.publicKey, decimals, mintAuthority, freezeAuthority, programId)

    console.log("Mints created");
    console.log("Mint 0", mints[0].toString());
    console.log("Mint 1", mints[1].toString());
    await delay(300);
    const baseMint = mints[1];
    const quoteMint = mints[0];

    const name = "FOO-OOF";
    let blockhash = await connection.getLatestBlockhash().then(res => res.blockhash);

    // Promise<[TransactionInstruction[], Signer[]]>;
    const [ixs, signers] = await client.createMarketIx(
        wallet.publicKey, // payer
        name,
        quoteMint,
        baseMint,
        new BN(1), // quoteLotSize
        new BN(1000000), // baseLotSize
        new BN(0), // makerFee
        new BN(0), // takerFee
        new BN(0), // timeExpiry
        null, // oracleA
        null, // oracleB
        null, // openOrdersAdmin
        null, // consumeEventsAdmin
        null //closeMarketAdmin
        // oracleConfigParams?
        // market?
        // collectFeeAdmin?
    );

    console.log("signers.:", signers);
    const slot = await connection.getSlot();
    const [lookupTableIx, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
        authority: wallet.publicKey,
        payer: wallet.publicKey,
        recentSlot: slot
    });

    const lookupTableMsgIx = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: [lookupTableIx],
    }).compileToV0Message();

    const messageSetUp = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: ixs,
    }).compileToV0Message();

    const versionedLookUpTx = new VersionedTransaction(lookupTableMsgIx);
    const versionedTx = new VersionedTransaction(messageSetUp);

    signers.forEach(signer => {
        versionedTx.signatures.push(signer.secretKey)
    })
    versionedTx.signatures.push(wallet.secretKey);


    sendJitoBundleFromIx(
        "createMarket Bundle: ",
        [versionedLookUpTx,versionedTx]
    );

    // openBook api: OpenBookV2Client
    // const tx = await client.sendAndConfirmTransaction(ixs,signers);

    // sendJitoBundleFromIx("create MarketId", [versionedLookUpTx, versionedTx]);

    // console.log("created market", tx);
    console.log(
        "finished with balance: ",
        await connection.getBalance(wallet.publicKey)
    );
}

main();

/**
 * DEVNET
 *   // In devent
  // const baseMint = new PublicKey("DEPipWZkmZcr1sL6pVwj8amRjr9kw91UkFR7tvqdvMy2");
  // const quoteMint = new PublicKey("BfvE9DViu6SkSMBz4TYVftd5DNp7bafemMujXBdVwFYN");
 
  // // WSOL
  // const baseMint = new PublicKey("So11111111111111111111111111111111111111112");
  // // USDC
  // const quoteMint = new PublicKey(
  //   "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  // );
 
  // // Sol/USD
  // const oracleAId = new PublicKey(
  //   "H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"
  // );
  // // USDC/USD
  // const oracleBId = new PublicKey(
  //   "Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD"
  // );
 
  // let [oracleAId, _tmp1] = PublicKey.findProgramAddressSync(
  //   [
  //     Buffer.from("StubOracle"),
  //     adminKp.publicKey.toBytes(),
  //     baseMint.toBytes(),
  //   ],
  //   programId
  // );
 
  // let [oracleBId, _tmp3] = PublicKey.findProgramAddressSync(
  //   [
  //     Buffer.from("StubOracle"),
  //     adminKp.publicKey.toBytes(),
  //     quoteMint.toBytes(),
  //   ],
  //   programId
  // );
 
  // let price = getRandomInt(1000);
 
  // if ((await anchorProvider.connection.getAccountInfo(oracleAId)) == null) {
  //   await program.methods
  //     .stubOracleCreate({ val: new BN(1) })
  //     .accounts({
  //       payer: adminKp.publicKey,
  //       oracle: oracleAId,
  //       mint: baseMint,
  //       systemProgram: SystemProgram.programId,
  //     })
  //     .signers([adminKp])
  //     .rpc();
  // }
  // if ((await anchorProvider.connection.getAccountInfo(oracleBId)) == null) {
  //   await program.methods
  //     .stubOracleCreate({ val: new BN(1) })
  //     .accounts({
  //       payer: adminKp.publicKey,
  //       oracle: oracleBId,
  //       mint: quoteMint,
  //       systemProgram: SystemProgram.programId,
  //     })
  //     .signers([adminKp])
  //     .rpc();
  // }
 
  // await program.methods
  //   .stubOracleSet({
  //     val: new BN(price),
  //   })
  //   .accounts({
  //     owner: adminKp.publicKey,
  //     oracle: oracleAId,
  //   })
  //   .signers([adminKp])
  //   .rpc();
 
  // await program.methods
  //   .stubOracleSet({
  //     val: new BN(price),
  //   })
  //   .accounts({
  //     owner: adminKp.publicKey,
  //     oracle: oracleBId,
  //   })
  //   .signers([adminKp])
  //   .rpc();
 
 */