import  { PublicKey } from '@solana/web3.js';
import { SystemProgram, TransactionInstruction } from '@solana/web3.js';



export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

export function createAssociatedTokenAccountIdempotentInstruction(
    payer: PublicKey,
    associatedToken: PublicKey,
    owner: PublicKey,
    mint: PublicKey,
    programId = TOKEN_PROGRAM_ID,
    associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID
): TransactionInstruction {
    return buildAssociatedTokenAccountInstruction(
        payer,
        associatedToken,
        owner,
        mint,
        Buffer.from([1]),
        programId,
        associatedTokenProgramId
    );
}

function buildAssociatedTokenAccountInstruction(
    payer: PublicKey,
    associatedToken: PublicKey,
    owner: PublicKey,
    mint: PublicKey,
    instructionData: Buffer,
    programId = TOKEN_PROGRAM_ID,
    associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID
): TransactionInstruction {
    const keys = [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: associatedToken, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: programId, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
        keys,
        programId: associatedTokenProgramId,
        data: instructionData,
    });
}
// const instrATA = createAssociatedTokenAccountIdempotentInstruction(new PublicKey('6uvSNUwiRJgtJ3iVb5SubLJR8LMrAsnwZkN9m9JACuaF'), new PublicKey('6uvSNUwiRJgtJ3iVb5SubLJR8LMrAsnwZkN9m9JACuaF'), new PublicKey('6uvSNUwiRJgtJ3iVb5SubLJR8LMrAsnwZkN9m9JACuaF'), new PublicKey('CutVKJemZYGLfqiKTY1EwFmd7kA4ndWgLcYABS65pump'), TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
// console.log('instrATA', instrATA.data.buffer);