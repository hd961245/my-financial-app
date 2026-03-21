import Anthropic from '@anthropic-ai/sdk';

// Singleton — avoids creating a new client on every request in dev HMR
const globalForClaude = globalThis as unknown as { claude?: Anthropic };

export const claude: Anthropic =
    globalForClaude.claude ??
    (globalForClaude.claude = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
    }));

export const CLAUDE_MODEL = 'claude-opus-4-6';

/**
 * Simple text generation — system + user prompt → string.
 */
export async function claudeText(
    systemPrompt: string,
    userPrompt: string,
    maxTokens = 1024,
): Promise<string> {
    const response = await claude.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
    });
    const block = response.content.find(b => b.type === 'text');
    return block?.type === 'text' ? block.text : '';
}

/**
 * JSON generation — instructs Claude to reply ONLY with valid JSON.
 * Strips any markdown fences before parsing.
 */
export async function claudeJSON<T = unknown>(
    systemPrompt: string,
    userPrompt: string,
    maxTokens = 2048,
): Promise<T> {
    const text = await claudeText(
        systemPrompt + '\n\n你必須只回傳合法的 JSON，不要加任何說明文字或 Markdown 程式碼塊。',
        userPrompt,
        maxTokens,
    );
    // Strip optional ```json ... ``` wrapper
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return JSON.parse(cleaned) as T;
}

/**
 * Vision — base64 image + text prompt → string.
 */
export async function claudeVision(
    systemPrompt: string,
    userPrompt: string,
    base64Image: string,
    mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg',
    maxTokens = 1024,
): Promise<string> {
    const response = await claude.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: userPrompt },
                    {
                        type: 'image',
                        source: { type: 'base64', media_type: mediaType, data: base64Image },
                    },
                ],
            },
        ],
    });
    const block = response.content.find(b => b.type === 'text');
    return block?.type === 'text' ? block.text : '';
}
