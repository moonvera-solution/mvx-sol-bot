// import { Connection, PublicKey, TokenAccountsFilter } from '@solana/web3.js';

// async function trackTargetedTransactions(ctx:any) {
//     ctx.session.env["tritonRPC"] = "https://moonvera-pit.rpcpool.com/";
// ctx.session.env["tritonToken"] = process.env.TRITON_RPC_TOKEN!;
// const connection = new Connection(
//     `${ctx.session.env.tritonRPC}${ctx.session.env.tritonToken}`
//   );
//     const walletPublicKey = new PublicKey('');
//     const poolAddress = ''; 
//     const raydiumProgramId = ''; 

//     const signatures = await connection.getSignaturesForAddress(walletPublicKey);

//     for (const signatureInfo of signatures) {
//         const transaction = await connection.getTransaction(signatureInfo.signature);

//         if (transaction) {
//             const involvesWallet = transaction.transaction.message.accountKeys.some(key => key.equals(walletPublicKey));
//             const involvesPool = transaction.transaction.message.accountKeys.some(key => key.toBase58() === poolAddress);
//             const involvesRaydium = transaction.transaction.message.instructions.some(instr => instr.programId && instr.programId.toBase58() === raydiumProgramId);

//             if (involvesWallet && involvesPool && involvesRaydium) {
//                 console.log(`Targeted transaction found: ${signatureInfo.signature}`);
//             }
//         }
//     }
// }

// trackTargetedTransactions(ctx);
