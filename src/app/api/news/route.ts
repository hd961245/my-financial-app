import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { getCachedQuote, setCachedQuote } from '@/lib/quote-cache';

export const dynamic = 'force-dynamic';

const parser = new Parser();
// 新聞快取 10 分鐘：主頁 60s poll 會命中快取，每 10 分鐘才重新抓 RSS
const NEWS_CACHE_TTL = 10 * 60 * 1000;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        let symbol = searchParams.get('symbol') || 'AAPL';
        symbol = symbol.replace('^', '');

        const cacheKey = `news:${symbol}`;
        const cached = getCachedQuote<object[]>(cacheKey);
        if (cached) return NextResponse.json(cached);

        const feedUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`;
        const feed = await parser.parseURL(feedUrl);

        if (!feed || !feed.items || feed.items.length === 0) {
            return NextResponse.json({ error: 'No news found' }, { status: 404 });
        }

        const mappedNews = feed.items.slice(0, 5).map(item => ({
            title: item.title,
            link: item.link,
            publisher: item.creator || 'Yahoo Finance',
            providerPublishTime: item.isoDate ? new Date(item.isoDate).getTime() : Date.now(),
            thumbnail: null
        }));

        setCachedQuote(cacheKey, mappedNews, NEWS_CACHE_TTL);
        return NextResponse.json(mappedNews);
    } catch (error) {
        console.error('Failed to fetch news:', error);
        return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
    }
}
