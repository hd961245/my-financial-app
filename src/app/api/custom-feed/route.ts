import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { getCachedQuote, setCachedQuote } from '@/lib/quote-cache';

const parser = new Parser();
const FETCH_TIMEOUT_MS = 10000;
// 自訂訂閱源快取 5 分鐘，避免每次 60s poll 都重抓所有 RSS / HTML
const FEED_CACHE_TTL = 5 * 60 * 1000;

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const CACHE_KEY = 'custom-feed:all';
        const cached = getCachedQuote<object[]>(CACHE_KEY);
        if (cached) return NextResponse.json(cached);

        const sources = await prisma.dataSource.findMany();

        const feedResults = await Promise.all(sources.map(async (source) => {
            try {
                if (source.type === 'RSS') {
                    const feed = await parser.parseURL(source.url);
                    return feed.items.slice(0, 5).map(item => ({
                        title: item.title,
                        link: item.link,
                        pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
                        sourceName: source.name,
                        sourceType: 'RSS',
                    }));
                } else if (source.type === 'HTML') {
                    // Primitive scraper for OpenGraph tags on HTML pages
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
                    try {
                        const res = await fetch(source.url, { signal: controller.signal, next: { revalidate: 3600 } });
                        const html = await res.text();
                        const $ = cheerio.load(html);
                        const title = $('meta[property="og:title"]').attr('content') || $('title').text();
                        const image = $('meta[property="og:image"]').attr('content');
                        return [{
                            title: title || 'No title found',
                            link: source.url,
                            pubDate: new Date().toISOString(),
                            sourceName: source.name,
                            sourceType: 'HTML',
                            thumbnail: image
                        }];
                    } finally {
                        clearTimeout(timeout);
                    }
                }
            } catch (err) {
                console.error(`Failed to fetch custom source ${source.name} (${source.url})`, err);
            }
            return [];
        }));

        const allFeeds = feedResults.flat();

        // Sort globally by pubDate descending
        allFeeds.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

        setCachedQuote(CACHE_KEY, allFeeds, FEED_CACHE_TTL);
        return NextResponse.json(allFeeds);
    } catch (error) {
        console.error('Failed to aggregate custom feeds:', error);
        return NextResponse.json({ error: 'Failed to aggregate custom feeds' }, { status: 500 });
    }
}
