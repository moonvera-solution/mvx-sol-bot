import WebSocket from 'ws';
import { trade, filterPoolsCallback } from './2_Strategy';
import { log } from 'console';

const botId = process.argv.slice(2)
const programId = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

function connect() {
  let isDone = false;
  const ws = new WebSocket(`ws://localhost:8080/?id=${botId}`);
  const TRITON_WS = 'https://moonvera-ams.rpcpool.com/6eb499c8-2570-43ab-bad8-fdf1c63b2b41/whirligig';
  const ws1 = new WebSocket(TRITON_WS, 'ws_endpoint' );

  ws.on('open', () => {
    console.log('Waiting on Geyser');
  });

  ws.on('message',async (data: any) => {
    // Close the connection to process data
    ws.close();
    console.log("processing request... closed",ws.CLOSED == 3);

      // filter & format poolKeys
      const poolKeys = await filterPoolsCallback(data, programId);
      if(poolKeys){
        isDone = await trade(poolKeys);
      }else{
        connect();
      }
      isDone && connect();
  });

  ws.on('close', () => {
    console.log('Disconnected from Geyser');
  });
}