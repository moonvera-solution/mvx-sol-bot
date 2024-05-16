import { SecretsManagerClient, GetSecretValueCommand, } from "@aws-sdk/client-secrets-manager";
import dotenv from 'dotenv'; dotenv.config();
const isProd = process.env.NODE_ENV == 'PROD';
import { console.log } from "../../../error/logger";


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
