import { SecretsManagerClient, GetSecretValueCommand, } from "@aws-sdk/client-secrets-manager";
import dotenv from 'dotenv'; dotenv.config();
const isProd = process.env.NODE_ENV == 'PROD';
import { logErrorToFile } from "../../../error/logger";


export async function _loadEnvVars(ctx: any) {
    try{
        let keys = isProd ? JSON.parse(await loadSecrets()) : null;
        ctx.session.env['triton'] = keys ? keys.tritonToken : process.env.TRITON_RPC_TOKEN;
    }catch(error:any){
        logErrorToFile("_loadEnvVars",error);
        console.error(error);
    }
}

export function loadSecrets():any {
    const secret_name = "mvx-bot-db"
    const client = new SecretsManagerClient({region: "ca-central-1"});
    let response;
    try {
         client.send(new GetSecretValueCommand({SecretId: secret_name})).then((data) => {
            if(data){response = data.SecretString;}
         });
    } catch (error: any) {
        throw error;
    }
    return response && response;
}
