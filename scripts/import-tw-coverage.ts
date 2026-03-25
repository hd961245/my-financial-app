/**
 * Import Taiwan stock research reports from Timeverse/My-TW-Coverage into the database.
 *
 * Usage:
 *   npx tsx scripts/import-tw-coverage.ts
 *   npx tsx scripts/import-tw-coverage.ts --ticker 2330
 *   npx tsx scripts/import-tw-coverage.ts --sector Semiconductors
 *   npx tsx scripts/import-tw-coverage.ts --limit 50
 *
 * Requires: DATABASE_URL in .env
 * Optional: GITHUB_TOKEN in .env for higher rate limits (5000 req/h vs 60 req/h)
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const REPO = 'Timeverse/My-TW-Coverage';
const REPORTS_PATH = 'Pilot_Reports';
const GITHUB_API = 'https://api.github.com';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main/${REPORTS_PATH}`;

const headers: Record<string, string> = {
  Accept: 'application/vnd.github.v3+json',
};
if (process.env.GITHUB_TOKEN) {
  headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
}

interface GitHubTreeItem {
  path: string;
  type: string;
  sha: string;
  url: string;
}

async function fetchJSON(url: string) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${url}`);
  return res.json();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

function extractWikilinks(content: string): string[] {
  const matches = content.matchAll(/\[\[([^\]]+)\]\]/g);
  const links = new Set<string>();
  for (const m of matches) {
    links.add(m[1].trim());
  }
  return Array.from(links);
}

function parseTicker(filename: string): { ticker: string; name: string } {
  // Filename format: "2330_台積電.md"
  const base = filename.replace('.md', '');
  const underscoreIdx = base.indexOf('_');
  if (underscoreIdx === -1) {
    return { ticker: base, name: base };
  }
  return {
    ticker: base.slice(0, underscoreIdx),
    name: base.slice(underscoreIdx + 1),
  };
}

async function getAllReportFiles(filterSector?: string): Promise<{ path: string; sector: string; filename: string }[]> {
  console.log('Fetching repository tree...');

  // Get the full tree recursively
  const repoInfo = await fetchJSON(`${GITHUB_API}/repos/${REPO}/git/trees/main?recursive=1`);
  const tree: GitHubTreeItem[] = repoInfo.tree;

  const mdFiles = tree.filter(
    (item) =>
      item.type === 'blob' &&
      item.path.startsWith(`${REPORTS_PATH}/`) &&
      item.path.endsWith('.md')
  );

  const results: { path: string; sector: string; filename: string }[] = [];
  for (const item of mdFiles) {
    // path: "Pilot_Reports/Semiconductors/2330_台積電.md"
    const parts = item.path.split('/');
    if (parts.length !== 3) continue;
    const sector = parts[1];
    const filename = parts[2];
    if (filterSector && sector !== filterSector) continue;
    results.push({ path: item.path, sector, filename });
  }

  return results;
}

async function importReport(
  filePath: string,
  sector: string,
  filename: string
): Promise<'created' | 'updated' | 'skipped'> {
  const { ticker, name } = parseTicker(filename);
  const rawUrl = `${RAW_BASE}/${sector}/${filename}`;

  let content: string;
  try {
    content = await fetchText(rawUrl);
  } catch (err) {
    console.warn(`  ⚠ Failed to fetch ${filename}: ${err}`);
    return 'skipped';
  }

  const wikilinks = extractWikilinks(content);

  const existing = await prisma.stockReport.findUnique({ where: { ticker } });

  await prisma.stockReport.upsert({
    where: { ticker },
    create: { ticker, name, sector, content, wikilinks, sourceUrl: rawUrl },
    update: { name, sector, content, wikilinks, sourceUrl: rawUrl },
  });

  return existing ? 'updated' : 'created';
}

async function main() {
  const args = process.argv.slice(2);
  const tickerArg = args.find((a) => a.startsWith('--ticker='))?.split('=')[1] ||
    (args.indexOf('--ticker') >= 0 ? args[args.indexOf('--ticker') + 1] : undefined);
  const sectorArg = args.find((a) => a.startsWith('--sector='))?.split('=')[1] ||
    (args.indexOf('--sector') >= 0 ? args[args.indexOf('--sector') + 1] : undefined);
  const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1] ||
    (args.indexOf('--limit') >= 0 ? args[args.indexOf('--limit') + 1] : undefined);
  const limit = limitArg ? parseInt(limitArg) : Infinity;

  console.log(`\n🇹🇼 Taiwan Stock Coverage Importer`);
  console.log(`   Repo: ${REPO}`);
  console.log(`   Token: ${process.env.GITHUB_TOKEN ? '✓ set' : '✗ not set (60 req/h limit)'}\n`);

  // Single ticker mode
  if (tickerArg) {
    console.log(`Importing single ticker: ${tickerArg}`);
    const allFiles = await getAllReportFiles();
    const target = allFiles.find((f) => parseTicker(f.filename).ticker === tickerArg);
    if (!target) {
      console.error(`Ticker ${tickerArg} not found in repository.`);
      process.exit(1);
    }
    const result = await importReport(target.path, target.sector, target.filename);
    console.log(`  ${result === 'created' ? '✅' : '🔄'} ${tickerArg} ${result}`);
    return;
  }

  // Bulk mode
  const files = await getAllReportFiles(sectorArg);
  const toProcess = files.slice(0, limit);
  console.log(`Found ${files.length} reports${sectorArg ? ` in ${sectorArg}` : ''}. Processing ${toProcess.length}...\n`);

  let created = 0, updated = 0, skipped = 0;
  const CONCURRENCY = 5; // GitHub rate limit friendly

  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const batch = toProcess.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((f) => importReport(f.path, f.sector, f.filename))
    );
    results.forEach((r, idx) => {
      const { ticker, name } = parseTicker(batch[idx].filename);
      const icon = r === 'created' ? '✅' : r === 'updated' ? '🔄' : '⚠';
      console.log(`  ${icon} [${i + idx + 1}/${toProcess.length}] ${ticker} ${name}`);
      if (r === 'created') created++;
      else if (r === 'updated') updated++;
      else skipped++;
    });

    // Small delay to be polite to GitHub API
    if (i + CONCURRENCY < toProcess.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log(`\n✅ Done! Created: ${created} | Updated: ${updated} | Skipped: ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
