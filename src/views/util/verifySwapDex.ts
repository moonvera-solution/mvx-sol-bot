
import { SOL_ADDRESS } from "../../config";

export async function verify_position_dex(ctx: any, token: string) {
  const rpcUrl = `${process.env.TRITON_RPC_URL}${process.env.TRITON_RPC_TOKEN}`;

  const feeAccount = null;
  let swapUrl = `${rpcUrl}/jupiter/price/v2?ids=${token},So11111111111111111111111111111111111111112`

  // `https://api.jup.ag/price/v2?ids=${token},So11111111111111111111111111111111111111112`
    const [jupTokenRate, quoteResponse] = await Promise.all([
    fetch(
      `https://api.jup.ag/price/v2?ids=${token},So11111111111111111111111111111111111111112`
    ).then((response) => response.json()).catch((error) => { console.error("Error fetching jup token rate: ", error); return null; }),
    fetch(swapUrl).then((response) => response.json()).catch((error) => { console.error("Error fetching jupiter swap quote: ", error); return null; }),
  
  ]);


  const jupTokenValue: any = Object.values(jupTokenRate.data);
  let isOnJupiter = false;
  console.log("quoteResponse", quoteResponse);
  if (
   ( jupTokenValue[0] &&
    jupTokenValue[0].price &&
    quoteResponse?.errorCode !== "TOKEN_NOT_TRADABLE" 
    // && quoteResponse?.errorCode !== 'COULD_NOT_FIND_ANY_ROUTE'
    ) 
  ) {
    isOnJupiter = true;
  }
  console.log("isOnJupiter", isOnJupiter);
  return isOnJupiter;
}

