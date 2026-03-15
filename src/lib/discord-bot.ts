import { Client, GatewayIntentBits, Events } from 'discord.js';
import OpenAI from 'openai';

// Use a global variable to store the client instance so we don't create multiple bots during hot-reloading in development
declare global {
    var __discordClient: Client | undefined;
}

// Initialize OpenAI client once at module level to avoid per-message instantiation
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

        // Check if there is text or an image
        const hasImage = message.attachments.some((a) => a.contentType?.startsWith('image/'));
        const hasText = message.content.trim().length > 0;

        if (!hasImage && !hasText) return;

        console.log(`[Discord Bot] Found message from ${message.author.tag}. Processing...`);

        try {
            const systemPrompt = `你是一位專業的『財經社群情報員』，在一個私人的投資群組中監聽對話與截圖。
使用者的訊息可能包含純文字、圖片，或是兩者皆有。
請你幫忙獨立思考並過濾：
1. 【情報判斷】：這則訊息是否包含實質的財經情報、明牌、股票代號、公司名稱或投資討論？
   - 如果「完全沒有」（例如只是日常聊天、打招呼、搞笑內容），請你直接回覆剛好四個字母：「NULL」，千萬不要回覆任何其他文字。
   - 如果有財經情報，請繼續執行第 2 與 3 步。
2. 【提取重點】：提取訊息或圖片中提到的【股票代號、名稱、或目標價/多空看法】。
3. 【情報員評語】：根據這些資訊，給出你客觀的一小段分析或評語（例如判斷這是真材實料還是需要注意風險）。`;

            const userContent: any[] = [];

            if (hasText) {
                userContent.push({ type: "text", text: `群組文字內容：「${message.content}」` });
            }

            if (hasImage) {
                const imageAttachment = message.attachments.find((a) => a.contentType?.startsWith('image/'))!;
                const imageResponse = await fetch(imageAttachment.url);
                const arrayBuffer = await imageResponse.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const base64Image = buffer.toString('base64');
                const mimeType = imageAttachment.contentType || 'image/jpeg';

                userContent.push({
                    type: "image_url",
                    image_url: { url: `data:${mimeType};base64,${base64Image}` }
                });
            }

            // Always show typing so the user knows the AI is thinking (it will disappear if the AI returns NULL and we don't reply)
            await message.channel.sendTyping();

            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent }
                ],
                max_tokens: 500,
            });

            const replyText = aiResponse.choices[0].message.content?.trim() || "";

            // Reply to the user in discord only if the AI found financial info
            if (replyText !== "NULL" && replyText.length > 0) {
                await message.reply({ content: `🤖 **情報員雷達 (攔截自 ${message.author.username} 的情報)：**\n\n${replyText}` });
                console.log(`[Discord Bot] Replied to ${message.author.tag} with analysis.`);
            } else {
                console.log(`[Discord Bot] Message ignored (No financial info detected).`);
            }
        } catch (err: any) {
            console.error('[Discord Bot] Error processing message:', err);
            // Optionally, we don't want to reply with an error message on EVERY text message if the API fails, to avoid spam.
            // But if it had an image, they definitely expected a reply.
            if (hasImage) {
                await message.reply({ content: `⚠️ 抱歉，我在處理這則情報時發生了錯誤。` });
            }
        }
    });

    try {
        await client.login(token);
        console.log('[Discord Bot] Starting connection...');
    } catch (error) {
        console.error('[Discord Bot] Connection failed (did you set the correct token?):', error);
    }
}
