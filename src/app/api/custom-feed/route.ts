import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';

const prisma = new PrismaClient();
const parser = new Parser();

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const sources = await prisma.dataSource.findMany();

        let allFeeds: any[] = [];

        // We process sequentially or Promise.all. 
        // For a large number of sources, a queue system is better, but this handles simple use-cases.
        await Promise.all(sources.map(async (source: any) => {
            try {
                if (source.type === 'RSS') {
                    const feed = await parser.parseURL(source.url);
                    // Take top 5 from this feed
                    const topItems = feed.items.slice(0, 5).map(item => ({
                        title: item.title,
                        link: item.link,
                        pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
                        sourceName: source.name,
                        sourceType: 'RSS',
                    }));
                    allFeeds = [...allFeeds, ...topItems];
                } else if (source.type === 'HTML') {
                    // Primitive scraper for OpenGraph tags on HTML pages
                    const res = await fetch(source.url, { next: { revalidate: 3600 } });
                    const html = await res.text();
                    const $ = cheerio.load(html);

                    const title = $('meta[property="og:title"]').attr('content') || $('title').text();
                    const image = $('meta[property="og:image"]').attr('content');

                    allFeeds.push({
                        title: title || 'No title found',
                        link: source.url,
                        pubDate: new Date().toISOString(),
                        sourceName: source.name,
                        sourceType: 'HTML',
                        thumbnail: image
                    });
                }
            } catch (err) {
                console.error(`Failed to fetch custom source ${source.name} (${source.url})`, err);
            }
        }));

        // Sort globally by pubDate descending
        allFeeds.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

        return NextResponse.json(allFeeds);
    } catch (error) {
        console.error('Failed to aggregate custom feeds:', error);
        return NextResponse.json({ error: 'Failed to aggregate custom feeds' }, { status: 500 });
    }
}
