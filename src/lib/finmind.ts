/**
 * FinMind API helper
 * 申請免費 token：https://finmindtrade.com/ → 右上角註冊 → API Token
 * 有 token 時每日請求上限從 600 次升至 6000 次（個人方案）
 */
export const FINMIND_BASE = 'https://api.finmindtrade.com/api/v4/data';

/**
 * Build a FinMind API URL, automatically appending `token` if
 * FINMIND_API_TOKEN is set in the environment.
 */
export function finmindUrl(params: Record<string, string>): string {
    const token = process.env.FINMIND_API_TOKEN;
    const qs = new URLSearchParams(params);
    if (token) qs.set('token', token);
    return `${FINMIND_BASE}?${qs.toString()}`;
}
