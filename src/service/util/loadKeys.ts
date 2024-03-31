import { SecretsManagerClient, GetSecretValueCommand, } from "@aws-sdk/client-secrets-manager";
import dotenv from 'dotenv'; dotenv.config();
const isProd = process.env.NODE_ENV == 'PROD';
import { logErrorToFile } from "../../../error/logger";


export async function _loadEnvVars(ctx: any) {
    try{
        let keys = isProd ? await loadSecrets() : null;
        ctx.session.env['triton'] = keys ? keys.tritonToken : process.env.TRITON_RPC_TOKEN;
        ctx.session.env['tg'] = keys ? keys.tgToken : process.env.TELEGRAM_BOT_TOKEN;
    }catch(error:any){
        logErrorToFile("_loadEnvVars",error);
        console.error(error);
    }
}

export async function loadSecrets(): Promise<any> {
    const secret_name = "mvx-bot-db"
    const client = new SecretsManagerClient({region: "ca-central-1"});
    let response;
    try {
        response = await client.send(new GetSecretValueCommand({SecretId: secret_name}));
    } catch (error: any) {
        throw error;
    }
    return response.SecretString;
}
