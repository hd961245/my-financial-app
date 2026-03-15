import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';

const parser = new Parser();
const FETCH_TIMEOUT_MS = 10000;

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
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

        return NextResponse.json(allFeeds);
    } catch (error) {
        console.error('Failed to aggregate custom feeds:', error);
        return NextResponse.json({ error: 'Failed to aggregate custom feeds' }, { status: 500 });
    }
}
