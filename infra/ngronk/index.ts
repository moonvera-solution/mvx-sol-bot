const http = require('http');
import dotenv from 'dotenv';
import { webhookCallback } from "grammy";
dotenv.config();

const express = require('express');
const app = express();
const webhookUrl = process.env.NGRONK_URL;
const botToken = process.env.TELEGRAM_BOT_TOKEN;

function setWebHook(
    bot:any,
) {
    bot.api.setWebhook(`${webhookUrl}/bot${botToken}`)
        .then(() => console.log("Webhook set successfully"))
        .catch((err:any) => console.error("Error setting webhook:", err)
        );
    const handleUpdate = webhookCallback(bot, 'express');
    // // Create the HTTP server and define request handling logic
    app.use(express.json()); // for parsing application/json

    app.post(`/bot${botToken}`, handleUpdate);

    app.get('/', (req: any, res: any) => {
        res.send('Hello from ngrok server!');
    });
    // const server = createServer(bot);
    const port = process.env.NGRONK_BOT_PORT || 3002;
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

