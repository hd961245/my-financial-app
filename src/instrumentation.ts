export async function register() {
    // Only spin up the bot on the Node.js server runtime
    // Avoids spinning it up in the Edge runtime or client side
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            // Dynamically import the discord bot script so that Next.js doesn't try to trace
            // discord.js native dependencies (like zlib-sync) into the Edge runtime.
            // const { registerDiscordBot } = await import('./lib/discord-bot');
            // await registerDiscordBot();
            console.log("[Instrumentation] Discord bot is temporarily disabled.");
        } catch (e) {
            console.error("[Instrumentation] Failed to register Discord bot:", e);
        }
    }
}
