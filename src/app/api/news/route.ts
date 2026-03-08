import { NextResponse } from 'next/server';
import Parser from 'rss-parser';

export const dynamic = 'force-dynamic';

const parser = new Parser();

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        // Default to AAPL if no symbol provided
        let symbol = searchParams.get('symbol') || 'AAPL';

        // Remove caret for index symbols parsing in URL
        symbol = symbol.replace('^', '');

        const feedUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`;
        const feed = await parser.parseURL(feedUrl);

        if (!feed || !feed.items || feed.items.length === 0) {
            return NextResponse.json({ error: 'No news found' }, { status: 404 });
        }

        // Map RSS items to the structure expected by the frontend
        const mappedNews = feed.items.slice(0, 5).map(item => ({
            title: item.title,
            link: item.link,
            publisher: item.creator || 'Yahoo Finance',
            providerPublishTime: item.isoDate ? new Date(item.isoDate).getTime() : Date.now(),
            // RSS parser doesn't extract thumbnails by default, we'll leave it empty to trigger the fallback UI icon
            thumbnail: null
        }));

        return NextResponse.json(mappedNews);
    } catch (error) {
        console.error('Failed to fetch news:', error);
        return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
    }
}
