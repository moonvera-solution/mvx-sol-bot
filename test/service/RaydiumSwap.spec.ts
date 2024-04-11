import dotenv from 'dotenv';dotenv.config();
import { handle_radyum_swap } from "../../src/service/portfolio/strategies/swaps";
import { test_poolKeys } from "../utils/testPool";
import { _initDbConnection } from "../../src/db/mongo/crud";
import {getUserTokenBalanceAndDetails} from "../../src/service/feeds/index";
import { PublicKey, Connection } from "@solana/web3.js";
import {PriotitizationFeeLevels} from "../../src/service/util/types";

const CHAT_ID = 1566352873; // update to your Id sync on db

const _getCtxFixture = () => { 
    const ctx = {
      chat: { id: CHAT_ID },
      session: {
        priorityFees: PriotitizationFeeLevels.LOW,
        activeWalletIndex: 0,
        portfolio: {
          wallets: [
            {
              publicKey: new PublicKey('cVsN11LTUjictK1sUMsxdT5J2PKxZcJ858RXKNVuuZ4'),//process.env.TEST_WALLET),
              secretKey: process.env.TEST_WALLET_PK,
            }
          ],
        },
        latestSlippage: 20,
        generatorWallet: new PublicKey("cVsN11LTUjictK1sUMsxdT5J2PKxZcJ858RXKNVuuZ4"),
        activeTradingPool: test_poolKeys,
        referralCommision: 35,
        env: {
          tritonRPC: "https://moonvera-pit.rpcpool.com/",
          tritonToken: '6eb499c8-2570-43ab-bad8-fdf1c63b2b41',//process.env.TRITON_RPC_TOKEN,
        },
      },
      api: {
        sendMessage: async (chatId: any, msg: any, options: any) => { console.log(msg) }
      },
      connection : new Connection("https://moonvera-pit.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41")
    }
  return ctx;
}

test("Raydium Swapping", async () => {
  await _initDbConnection();
  const ctx = _getCtxFixture();
  const tokenOut = new PublicKey('WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk');

  // let b4Swap= await getUserTokenBalanceAndDetails(ctx.session.portfolio.wallets[0].publicKey, tokenOut, ctx.connection);

  await handle_radyum_swap(ctx, tokenOut, 'buy', 0.0001);

  // let afterSwap= await getUserTokenBalanceAndDetails(ctx.session.portfolio.wallets[0].publicKey, tokenOut, ctx.connection);

  // expect(afterSwap.userTokenBalance).toBeGreaterThan(b4Swap.userTokenBalance);

});