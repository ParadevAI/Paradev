import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HOST = "paradev.com";
const SITEMAP_URL = `https://${HOST}/sitemap.xml`;
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const BATCH_SIZE = 10_000;

function readKey(): string {
	const publicDir = join(import.meta.dir, "..", "public");
	const keyFiles = readdirSync(publicDir).filter((name) =>
		/^[0-9a-f]{32}\.txt$/.test(name),
	);
	if (keyFiles.length !== 1) {
		throw new Error(
			`Expected one IndexNow key file in ${publicDir}, found ${keyFiles.length}`,
		);
	}
	const [keyFile] = keyFiles as [string];
	const key = readFileSync(join(publicDir, keyFile), "utf8").trim();
	if (`${key}.txt` !== keyFile) {
		throw new Error(`${keyFile} does not contain its own key`);
	}
	return key;
}

function extractLocs(xml: string): string[] {
	return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(
		(match) => match[1] as string,
	);
}

async function fetchText(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`GET ${url} failed: ${response.status}`);
	}
	return response.text();
}

async function collectUrls(sitemapUrl: string): Promise<string[]> {
	const xml = await fetchText(sitemapUrl);
	const locs = extractLocs(xml);
	if (!xml.includes("<sitemapindex")) return locs;
	const children = await Promise.all(locs.map(collectUrls));
	return children.flat();
}

async function main() {
	const dryRun = process.argv.includes("--dry-run");
	const key = readKey();
	const urls = [...new Set(await collectUrls(SITEMAP_URL))].filter(
		(url) => new URL(url).hostname === HOST,
	);
	const batches: string[][] = [];
	for (let i = 0; i < urls.length; i += BATCH_SIZE) {
		batches.push(urls.slice(i, i + BATCH_SIZE));
	}
	console.log(
		`${urls.length} URLs from ${SITEMAP_URL}, ${batches.length} batch(es)`,
	);
	if (dryRun) return;

	for (const [index, urlList] of batches.entries()) {
		const response = await fetch(INDEXNOW_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json; charset=utf-8" },
			body: JSON.stringify({
				host: HOST,
				key,
				keyLocation: `https://${HOST}/${key}.txt`,
				urlList,
			}),
		});
		console.log(
			`Batch ${index + 1}/${batches.length} (${urlList.length} URLs): ${response.status} ${await response.text()}`,
		);
		if (!response.ok) process.exitCode = 1;
	}
}

await main();
