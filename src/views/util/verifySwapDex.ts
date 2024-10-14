
import { SOL_ADDRESS } from "../../config";

export async function verify_position_dex(ctx: any, token: string) {
  const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`;

  const feeAccount = null;
  let swapUrl =
    `${rpcUrl}/jupiter/quote?inputMint=${SOL_ADDRESS}&outputMint=${token}&amount=${1}&slippageBps=${
      ctx.session.latestSlippage
    }${feeAccount ? "&platformFeeBps=08" : ""}`.trim();
    const optionsBird = {method: 'GET', headers: {'X-API-KEY': '2036bb1a097a4414a86ba8e3a8bdafbf'}};
    const [jupTokenRate, quoteResponse] = await Promise.all([
    fetch(
      `https://price.jup.ag/v6/price?ids=${token}&vsToken=So11111111111111111111111111111111111111112`
    ).then((response) => response.json()),
    fetch(swapUrl).then((response) => response.json()),
  
  ]);



  const jupTokenValue: any = Object.values(jupTokenRate.data);
  let isOnJupiter = false;
  // console.log("quoteResponse", quoteResponse);
  if (
   ( jupTokenValue[0] &&
    jupTokenValue[0].price &&
    quoteResponse?.errorCode !== "TOKEN_NOT_TRADABLE" 
    // && quoteResponse?.errorCode !== 'COULD_NOT_FIND_ANY_ROUTE'
    ) 
  ) {
    console.log('here maybe meteora')
    isOnJupiter = true;
  }
  console.log("isOnJupiter", isOnJupiter);
  return isOnJupiter;
}

