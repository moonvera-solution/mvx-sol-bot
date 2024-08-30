
export async function handleCloseKeyboard(ctx: any) {
    const chatId = ctx.chat.id;
    const messageId = ctx.msg.message_id;
    try {
      // Delete the message with the inline keyboard
      await ctx.api.deleteMessage(chatId, messageId);
      ctx.session.latestCommand = 'jupiter_swap';

      // console.info(`Message with keyboard deleted for chatId: ${chatId}`);       
    } catch (error: any) {
      console.error(`Error in handleCloseKeyboard for chatId ${chatId}:`, error.message);
    }
  }

  export async function handleCloseInputUser(ctx: any) {
    const chatId = ctx.chat.id;
    const messageId = ctx.msg.message_id;
    try {
      // Delete the message with the inline keyboard
      await ctx.api.deleteMessage(chatId, messageId);
      ctx.session.latestCommand = 'jupiter_swap';
      // console.info(`Message with keyboard deleted for chatId: ${chatId}`);       
    } catch (error: any) {
      console.error(`Error in handleCloseKeyboard for chatId ${chatId}:`, error.message);
    }
  }
  