import { Client, GatewayIntentBits, Events } from 'discord.js';
import OpenAI from 'openai';

// Use a global variable to store the client instance so we don't create multiple bots during hot-reloading in development
declare global {
    var __discordClient: Client | undefined;
}

export async function registerDiscordBot() {
    const token = process.env.DISCORD_BOT_TOKEN;

    if (!token) {
        console.log('[Discord Bot] No DISCORD_BOT_TOKEN found. Bot is disabled.');
        return;
    }

    if (global.__discordClient) {
        console.log('[Discord Bot] Already initialized.');
        return;
    }

    // Initialize the Discord client
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
        ],
    });

    global.__discordClient = client;

    // When the bot is ready
    client.once(Events.ClientReady, (readyClient) => {
        console.log(`[Discord Bot] Ready! Logged in as ${readyClient.user.tag}`);
    });

    // When a message is created in any channel the bot has access to
    client.on(Events.MessageCreate, async (message) => {
        // Ignore messages from bots (including ourselves)
        if (message.author.bot) return;

        // Ensure there are attachments
        if (message.attachments.size === 0) return;

        // Filter for image attachments
        const imageAttachment = message.attachments.find((a) => a.contentType?.startsWith('image/'));

        if (!imageAttachment || !imageAttachment.url) return;

        console.log(`[Discord Bot] Found image from ${message.author.tag}. Processing...`);

        try {
            // Show the "Bot is typing..." indicator to let the user know it's working
            await message.channel.sendTyping();

            // Download the image
            const imageResponse = await fetch(imageAttachment.url);
            const arrayBuffer = await imageResponse.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64Image = buffer.toString('base64');
            const mimeType = imageAttachment.contentType || 'image/jpeg';

            // Send to OpenAI Vision
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            const systemPrompt = `你是一位專業的『財經社群情報員』。
使用者上傳了一張他們在社群群組收到的財經相關截圖。
請你幫忙：
1. 辨識並提取圖片中有提到的【股票代號或名稱】。
2. 判斷這張圖傳遞的【情報摘要】（例如：這是在炫耀獲利、還是在推薦某檔股票、或是單純的走勢圖？）。
3. 給出你客觀的【一小段評語】。
如果圖片中完全沒有財經資訊，請回覆：「抱歉，我在這張圖中找不到明顯的財經資訊喔！」`;

            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: message.content ? `附加的文字內容：「${message.content}」\n請結合圖片一起分析重點：` : "請幫我分析這張截圖的重點：" },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:${mimeType};base64,${base64Image}`,
                                },
                            },
                        ],
                    }
                ],
                max_tokens: 500,
            });

            const replyText = aiResponse.choices[0].message.content;

            // Reply to the user in discord, mentioning them
            if (replyText) {
                await message.reply({ content: `🤖 **情報員分析報告：**\n\n${replyText}` });
            }
        } catch (err: any) {
            console.error('[Discord Bot] Error processing message:', err);
            await message.reply({ content: `⚠️ 抱歉，我在處理這張圖片時發生了錯誤。` });
        }
    });

    try {
        await client.login(token);
        console.log('[Discord Bot] Starting connection...');
    } catch (error) {
        console.error('[Discord Bot] Connection failed (did you set the correct token?):', error);
    }
}
