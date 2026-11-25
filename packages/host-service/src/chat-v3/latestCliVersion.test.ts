import { describe, expect, it } from "bun:test";
import { createLatestCliVersion } from "./latestCliVersion";

const HOUR_MS = 60 * 60_000;
const NPM = { kind: "npm", name: "@openai/codex", tag: "latest" } as const;

function fakeRegistry(bodies: unknown[]) {
	const urls: string[] = [];
	const fetch = (async (url: string) => {
		urls.push(url);
		const body = bodies.shift();
		return body === undefined
			? new Response("", { status: 503 })
			: Response.json(body);
	}) as unknown as typeof globalThis.fetch;
	return { fetch, urls };
}

describe("createLatestCliVersion", () => {
	it("asks the registry once a day", async () => {
		const registry = fakeRegistry([
			{ latest: "0.165.0" },
			{ latest: "0.166.0" },
		]);
		let now = 0;
		const latest = createLatestCliVersion({
			fetch: registry.fetch,
			now: () => now,
		});

		expect(await latest(NPM)).toBe("0.165.0");
		now = 23 * HOUR_MS;
		expect(await latest(NPM)).toBe("0.165.0");
		now = 25 * HOUR_MS;
		expect(await latest(NPM)).toBe("0.166.0");
		expect(registry.urls).toEqual([
			"https://registry.npmjs.org/-/package/@openai/codex/dist-tags",
			"https://registry.npmjs.org/-/package/@openai/codex/dist-tags",
		]);
	});

	it("tries a failed lookup again after an hour, not a day", async () => {
		const registry = fakeRegistry([undefined, { latest: "0.165.0" }]);
		let now = 0;
		const latest = createLatestCliVersion({
			fetch: registry.fetch,
			now: () => now,
		});

		expect(await latest(NPM)).toBeNull();
		now = 2 * HOUR_MS;
		expect(await latest(NPM)).toBe("0.165.0");
	});

	it("reads a Homebrew cask's version without its build suffix", async () => {
		const registry = fakeRegistry([{ version: "2.1.312,a1b2c3" }]);
		const latest = createLatestCliVersion({ fetch: registry.fetch });

		expect(
			await latest({
				kind: "homebrew",
				name: "claude-code@latest",
				homebrewKind: "cask",
			}),
		).toBe("2.1.312");
		expect(registry.urls).toEqual([
			"https://formulae.brew.sh/api/cask/claude-code@latest.json",
		]);
	});
});
