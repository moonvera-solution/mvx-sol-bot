import { bool, publicKey, u64 } from '@solana/buffer-layout-utils';
import { SecretsManagerClient, GetSecretValueCommand, } from "@aws-sdk/client-secrets-manager";
import dotenv from 'dotenv';
dotenv.config();
import { struct, u32, u8 } from '@solana/buffer-layout';
import { Multisig, RawAccount } from './index';

export type RawMultisig = Omit<Multisig, 'address'>;
const isProd = process.env.NODE_ENV == 'PROD';
// import { console.log } from "../../../error/logger";


export async function _loadEnvVars(ctx: any) {
    try {
        let keys = isProd ? JSON.parse(await loadSecrets()) : null;
        ctx.session.triton = keys ? keys.tritonToken : process.env.TRITON_RPC_TOKEN;
    } catch (error: any) {
        console.log("_loadEnvVars", error);
        console.error(error);
    }
}

export function loadSecrets(): any {
    return new Promise((resolve, reject) => {
        const secret_name = "mvx-bot-db"
        const client = new SecretsManagerClient({ region: "ca-central-1" });
        try {
            client.send(new GetSecretValueCommand({ SecretId: secret_name })).then((data) => {
                if (data) { resolve(data.SecretString) }
            });
        } catch (error: any) {
            reject();
        }
    })


}


/** Buffer layout for de/serializing a multisig */
export const MultisigLayout = struct<RawMultisig>([
    u8('m'),
    u8('n'),
    bool('isInitialized'),
    publicKey('signer1'),
    publicKey('signer2'),
    publicKey('signer3'),
    publicKey('signer4'),
    publicKey('signer5'),
    publicKey('signer6'),
    publicKey('signer7'),
    publicKey('signer8'),
    publicKey('signer9'),
    publicKey('signer10'),
    publicKey('signer11'),
]);

/** Buffer layout for de/serializing a token account */
export const AccountLayout = struct<RawAccount>([
    publicKey('mint'),
    publicKey('owner'),
    u64('amount'),
    u32('delegateOption'),
    publicKey('delegate'),
    u8('state'),
    u32('isNativeOption'),
    u64('isNative'),
    u64('delegatedAmount'),
    u32('closeAuthorityOption'),
    publicKey('closeAuthority'),
]);

