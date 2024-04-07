const mongoose = require('mongoose');
const axios = require('axios');
const dotenv = require('dotenv');
const Schema = mongoose.Schema;
const { Connection, PublicKey } = require('@solana/web3.js');
const BigNumber = require('bignumber.js');
const Bottleneck = require('bottleneck'); // Install this package via npm

dotenv.config();

const user = encodeURIComponent(process.env.DB_USER);
const password = encodeURIComponent(process.env.DB_PASSWORD);
const ec2_user = encodeURIComponent(process.env.EC2_CRON_USER);
const ec2_password = encodeURIComponent(process.env.EC2_DB_PASSWORD);
const isProd = process.env.NODE_ENV == 'dev';
const authMechanism = 'SCRAM-SHA-1';

const local_url = `mongodb://${user}:${password}@localhost:35048/bot`;
const ec2_url = `mongodb://${ec2_user}:${ec2_password}@localhost:35048/bot`;
const connection = new Connection('https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41')


/**
 * All DB functions are prefized with an underscore (_)
 */
const db = mongoose.connection;

function _initDbConnection() {
    mongoose.connect(isProd ? ec2_url : local_url);
    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', function () {
        console.log("Db connection successful");
    });
}

const PoolInfoSchema = new Schema({
    "id": { type: String, unique: true },
    "baseMint": String,
    "quoteMint": String,
    "lpMint": String,
    "baseDecimals": Number,
    "quoteDecimals": Number,
    "lpDecimals": Number,
    "version": Number,
    "programId": String,
    "authority": String,
    "openOrders": String,
    "targetOrders": String,
    "baseVault": String,
    "quoteVault": String,
    "withdrawQueue": String,
    "lpVault": String,
    "marketVersion": Number,
    "marketProgramId": String,
    "marketId": String,
    "marketAuthority": String,
    "marketBaseVault": String,
    "marketQuoteVault": String,
    "marketBids": String,
    "marketAsks": String,
    "marketEventQueue": String,
    "lookupTableAccount": String
});

const Raydium_unOfficial_pools = mongoose.model('Raydium_unOfficial_pools', PoolInfoSchema);
const Raydium_official_pools = mongoose.model('Raydium_official_pools', PoolInfoSchema);

async function seedRaydium_unOfficial_pools(pool) {
    const raydium_unOfficial_pools = new Raydium_unOfficial_pools({
        "id": pool.id,
        "baseMint": pool.baseMint,
        "quoteMint": pool.quoteMint,
        "lpMint": pool.lpMint,
        "baseDecimals": pool.baseDecimals,
        "quoteDecimals": pool.quoteDecimals,
        "lpDecimals": pool.lpDecimals,
        "version": pool.version,
        "programId": pool.programId,
        "authority": pool.authority,
        "openOrders": pool.openOrders,
        "targetOrders": pool.targetOrders,
        "baseVault": pool.baseVault,
        "quoteVault": pool.quoteVault,
        "withdrawQueue": pool.withdrawQueue,
        "lpVault": pool.lpVault,
        "marketVersion": pool.marketVersion,
        "marketProgramId": pool.marketProgramId,
        "marketId": pool.marketId,
        "marketAuthority": pool.marketAuthority,
        "marketBaseVault": pool.marketBaseVault,
        "marketQuoteVault": pool.marketQuoteVault,
        "marketBids": pool.marketBids,
        "marketAsks": pool.marketAsks,
        "marketEventQueue": pool.marketEventQueue,
        "lookupTableAccount": pool.lookupTableAccount,
    });
    raydium_unOfficial_pools.save();
}

async function seedRaydium_official_pools(pool) {
    const raydium_official_pools = new Raydium_official_pools({
        "id": pool.id,
        "baseMint": pool.baseMint,
        "quoteMint": pool.quoteMint,
        "lpMint": pool.lpMint,
        "baseDecimals": pool.baseDecimals,
        "quoteDecimals": pool.quoteDecimals,
        "lpDecimals": pool.lpDecimals,
        "version": pool.version,
        "programId": pool.programId,
        "authority": pool.authority,
        "openOrders": pool.openOrders,
        "targetOrders": pool.targetOrders,
        "baseVault": pool.baseVault,
        "quoteVault": pool.quoteVault,
        "withdrawQueue": pool.withdrawQueue,
        "lpVault": pool.lpVault,
        "marketVersion": pool.marketVersion,
        "marketProgramId": pool.marketProgramId,
        "marketId": pool.marketId,
        "marketAuthority": pool.marketAuthority,
        "marketBaseVault": pool.marketBaseVault,
        "marketQuoteVault": pool.marketQuoteVault,
        "marketBids": pool.marketBids,
        "marketAsks": pool.marketAsks,
        "marketEventQueue": pool.marketEventQueue,
        "lookupTableAccount": pool.lookupTableAccount,
    });
    raydium_official_pools.save();
}

function _getESTime() {
    const date = new Date();
    const utcDate = new Date(date.toUTCString());
    utcDate.setHours(utcDate.getHours() - 5);
    const usDate = new Date(utcDate);
    return (usDate);
}

// LOAD DATA FROM RAYDIUM JSON
async function _fetchJson() {
    const url = `https://api.raydium.io/v2/sdk/liquidity/mainnet.json`;
    try {
        console.info("Fetching Json file:", _getESTime());
        const response = await axios.get(url);
        let jsonData = response.data; // Store the data in the variable
        
        console.info("finding token...");

        jsonData.unOfficial.forEach(async (pool) => {
             console.log('token: -----',pool.baseMint)
            if(pool.baseMint == "6omGNaPWYbEy5H1F8BCjNeSoV34e6vdxxfdKeftCA2q8"){
                console.log("pool: ", pool.id);
            }
            // const poolExists = await Raydium_unOfficial_pools.findOne({ id: pool.id });
            // // _deleteEmptyPools(pool);
            // poolExists == null ? seedRaydium_unOfficial_pools(pool) : null;
        });
        jsonData.official.forEach(async (pool) => {
            console.log('token: ----',pool.baseMint)
            if(pool.baseMint == "6omGNaPWYbEy5H1F8BCjNeSoV34e6vdxxfdKeftCA2q8"){
                console.log("pool: ", pool.id);
            }
            // const poolExists = await Raydium_official_pools.findOne({ id: pool.id });
            // // _deleteEmptyPools(pool);
            // poolExists == null ? seedRaydium_official_pools(pool) : null;
        });
        console.log("done")
    } catch (err) {
        console.log("Cron error FetchJson: ", err);
    }
}

_fetchJson();

// Cleans db
const limiter = new Bottleneck({
    maxConcurrent: 10,
    minTime: 500
  });

async function _deleteEmptyPools() {
    const pools = await Raydium_unOfficial_pools.find();
    for (let i = 0; i < pools.length; i += 10) {
        const batch = pools.slice(i, i + 10);
        await Promise.all(batch.map(pool => limiter.schedule(() => __processPool(pool))));
    }
}

async function __processPool(pool) {
    const poolExists = await Raydium_unOfficial_pools.findOne({ id: pool.id });
    if (poolExists) {
        const baseVault = await connection.getParsedAccountInfo(new PublicKey(pool.baseVault), "finalized");
        console.log("baseVault pool: ", baseVault.value?.data.parsed.info.tokenAmount.amount, pool.id.toString());

        const quoteVault = await connection.getParsedAccountInfo(new PublicKey(pool.quoteVault), "finalized");
        console.log("quoteVault pool: ", quoteVault.value?.data.parsed.info.tokenAmount.amount, pool.id.toString());
        const QuoteVaultAmount = new BigNumber(quoteVault.value?.data.parsed.info.tokenAmount.amount);
        // Less than 1 SOL in Quote = Delete pool
        if (QuoteVaultAmount.div(new BigNumber(1e9)).lt(1)) { // at least One SOL
            console.log("Deleting pool: ", pool.id.toString());
            await Raydium_unOfficial_pools.deleteOne({ id: pool.id });
        }
    }
}


/**
    A cron job is a Linux command used for scheduling tasks to be executed sometime in the future. 
    This is normally used to schedule a job that is executed periodically.
 */

async function _runCronJob() {
    console.info("job start: ", _getESTime());

    const Raydium_unOfficial_pools_b4_cron = await Raydium_unOfficial_pools.countDocuments();
    const Raydium_official_pools_b4_cron = await Raydium_official_pools.countDocuments();
    await _fetchJson();
    // await _deleteEmptyPools();
    const Raydium_unOfficial_pools_aftr_cron = await Raydium_unOfficial_pools.countDocuments();
    const Raydium_official_pools_aftr_cron = await Raydium_official_pools.countDocuments();

    const un = Raydium_unOfficial_pools_aftr_cron - Raydium_unOfficial_pools_b4_cron;
    const of = Raydium_official_pools_aftr_cron - Raydium_official_pools_b4_cron;
    console.info("job end: ", _getESTime());

    console.info(`-- Added:`);
    console.info(`-- ${un} new unOfficial pools.`);
    console.info(`-- ${of} new official pools.`);
}

// async function cleanDb() {
//     const pools = await PoolInfo.find();
//     const pools_b4_clean = await PoolInfo.countDocuments();

//     console.log("pools_b4_clean: ", pools_b4_clean);
//     await _deleteEmptyPools(pools);

//     const pools_aftr_clean = await PoolInfo.countDocuments();
//     console.log("pools_aftr_clean: ", pools_aftr_clean);
// }

async function _runCron() {
    _initDbConnection();
   await _runCronJob(); // Run the job immediately
    // await cleanDb()
    setInterval(_runCronJob, 5 * 60 * 1000); // then every 5 min
}
// _runCron();


