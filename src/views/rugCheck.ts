
// function display_rugCheck() {
//     let editOptions: TelegramBot.EditMessageTextOptions = {
//         chat_id: chatId,
//         message_id: messageId,
//         parse_mode: 'HTML',
//         disable_web_page_preview: true,

//     };
//     console.log('messageId', messageId)
//     // Construct the message
//     let messageText = `<b>${tokenInfo.name} (${tokenInfo.symbol})</b> | 📄 CA: <code>${tokenAddress}</code> <a href="copy:${tokenAddress}">🅲</a>\n` +
//         `<a href="${birdeyeURL}">👁️ Birdeye</a> | ` +
//         `<a href="${dextoolsURL}">🛠 Dextools</a> | ` +
//         `<a href="${dexscreenerURL}">🔍 Dexscreener</a>\n\n` +
//         `📝 Description:\n ${description}\n\n` +
//         `👨🏼‍🦰 Creator: <code>${creatorAddress}</code> <a href="copy:${creatorAddress}"></a>\n` +
//         `🏭 Creator Percentage: <b>${(Number(creatorPerecent) * 100).toFixed(2)} %</b>\n` +
//         `👥 Top 10 Holders: <b>${(Number(topHolders) * 100).toFixed(2)} %</b>\n` +
//         `🏭 Total Supply: <b>${formattedTotalSupply}</b>\n` +
//         // `🎱 Pooled SOL: <b>${(Number(formattedpooledSol)).toFixed(3)}</b> SOL \n`+
//         `👤 Renounced: ${renounced}\n` +
//         `🔣 Mutable info: ${metadata}\n` +
//         `💵 Token Price:<b> ${Number(tokenInfo.price).toFixed(decimals)}</b> USD\n` +
//         `💹 Market Cap: <b>${formattedmac}</b> USD\n` +
//         `💧 Liquidity: <b>${(formattedLiquidity)}</b>  USD\n` +
//         `🎱 LpBurnt: <b>${(lpBurnt)}</b>`;
//     let options: Telegrambot.api.sendMessageOptions | undefined;
//     options = {
//         parse_mode: 'HTML',
//         disable_web_page_preview: true,
//         reply_markup: {
//             inline_keyboard: [
//                 [{ text: ' 🔂 Refresh ', callback_data: 'refresh_rug' }, { text: ' ⚙️ Settings ', callback_data: 'settings' }],
//                 [{ text: '💱 Buy', callback_data: 'buy' }, { text: 'Sell 📈', callback_data: 'sell' }],
//                 [{ text: 'Close', callback_data: 'closing' }]
//             ]
//         }
//     };
// }