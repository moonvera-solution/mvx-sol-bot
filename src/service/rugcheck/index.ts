// export async function rugCheck(chatId: any, tokenAddress: any, messageId?: number) {
//     if (!isValidBase58(tokenAddress)) {
//         console.error('Invalid token address:', tokenAddress);
//         bot.api.sendMessage(chatId, "Invalid token address provided.", { parse_mode: 'HTML' });
//         return;
//     }
//     try {

//         if (!poolDetails) {
//             bot.api.sendMessage(chatId, `No pool found for token: ${tokenAddress}`, { parse_mode: 'HTML' });
//             return;
//         }
//         const lpMintAddress = poolDetails?.lpMint?.toString()
//         //Liquidity
//         let formattedLiquidity = await formatNumberToKOrM(Number(tokenInfo.liquidity)) ?? "N/A"
//         //Mcap
//         let formattedmac = await formatNumberToKOrM(tokenInfo.mc) ?? "NA"
//         const renounced = token.mint.mintAuthorityAddress?.toString() !== token.updateAuthorityAddress.toString() ?
//             '✅' : '❌ No';
//         const metadata = Number(token.isMutable) == 0 ? '✅ No' : '⚠️ Yes';
//         const lpMintOwner = await getTokenOwnerFromBirdEye(lpMintAddress!);
//         const lpBurnt = lpMintOwner.data.owner.toString() === '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1' ? '✅' : '❌ No';



//         if (messageId) {
//             await bot.editMessageText(messageText, { ...editOptions });
//         }
//         await bot.api.sendMessage(chatId, messageText, options);

//     } catch (error: any) {
//         console.error('Error in getTokenMetadata:', error.message);
//         bot.api.sendMessage(chatId, "Error getting token data, verify the address..", { parse_mode: 'HTML' });
//     }
// }