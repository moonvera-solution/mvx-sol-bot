import mongoose from 'mongoose';
const dotenv = require('dotenv');
dotenv.config();
const { WalletKeysV2, WalletKeys } = require("./schema");

const user = encodeURIComponent(process.env.DB_USER!);
const password = encodeURIComponent(process.env.DB_PASSWORD!);
const ec2_user = encodeURIComponent(process.env.EC2_CRON_USER!);
const ec2_password = encodeURIComponent(process.env.EC2_DB_PASSWORD!);
const isProd = process.env.NODE_ENV == 'PROD';
const authMechanism = 'SCRAM-SHA-1';

const local_url = `mongodb://${user}:${password}@localhost:27017/test`;
const ec2_url = `mongodb://${ec2_user}:${ec2_password}@localhost:27017/test`;

async function migrateData() {
    mongoose.connect(isProd ? ec2_url : local_url);
    const db = mongoose.connection;
    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', function () { console.log("Connected to DB"); });

   (await WalletKeys.find()).forEach(function (wallet:any) {
        const w2 = new WalletKeysV2({
            "chatId":1566352873,
            "wallets": [
                {
                    "walletId": 'solfiFvVDc6gZmYho6DLLuJ3ptHS6rxb797Cxf1insiUnu2BLbot',
                    "publicKey": wallet.publicKey,
                    "secretKey": wallet.secretKey,
                }
            ]
        });
        console.log("Inserting...", wallet.chatId);
        w2.save();
    });
    /** close connection */
    db.close();
}
// migrateData();