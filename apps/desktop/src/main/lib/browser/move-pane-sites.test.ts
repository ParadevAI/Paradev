import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { movePaneSitesOnce } from "./move-pane-sites";

function cookie(overrides: Partial<Electron.Cookie>): Electron.Cookie {
	return {
		name: "sid",
		value: "v",
		domain: "example.com",
		hostOnly: true,
		path: "/",
		secure: true,
		httpOnly: true,
		session: false,
		expirationDate: 2_000_000_000,
		sameSite: "lax",
		...overrides,
	};
}

function store(cookies: Electron.Cookie[] = []) {
	const written: Electron.CookiesSetDetails[] = [];
	return {
		written,
		get: async () => cookies,
		set: async (details: Electron.CookiesSetDetails) => {
			if (details.name === "refused") throw new Error("refused by store");
			written.push(details);
		},
	};
}

function move(
	from: ReturnType<typeof store>,
	to: ReturnType<typeof store>,
	markerPath: string,
	visitedUrls: string[] = [],
) {
	const cleared: string[][] = [];
	const copied = movePaneSitesOnce({
		from,
		to,
		markerPath,
		readVisitedUrls: () => visitedUrls,
		clearOldSites: async (origins) => {
			cleared.push(origins);
		},
	});
	return { cleared, copied };
}

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "pane-cookies-"));
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("movePaneSitesOnce", () => {
	it("copies host-only and domain cookies, and only on the first run", async () => {
		const from = store([
			cookie({ name: "host", domain: "example.com", hostOnly: true }),
			cookie({
				name: "dom",
				domain: ".github.com",
				hostOnly: false,
				path: "/login",
				secure: false,
			}),
		]);
		const to = store();
		const markerPath = join(dir, "copied");

		expect(await move(from, to, markerPath).copied).toBe(2);
		expect(to.written).toEqual([
			expect.objectContaining({
				url: "https://example.com/",
				name: "host",
				domain: undefined,
			}),
			expect.objectContaining({
				url: "http://github.com/login",
				name: "dom",
				domain: ".github.com",
			}),
		]);

		expect(await move(from, to, markerPath).copied).toBe(0);
		expect(to.written).toHaveLength(2);
	});

	it("keeps copying when the target refuses one cookie, then clears nothing", async () => {
		const from = store([
			cookie({ name: "refused" }),
			cookie({ name: "kept", domain: "a.test" }),
		]);
		const to = store();

		const run = move(from, to, join(dir, "copied"), ["https://a.test/"]);
		expect(await run.copied).toBe(1);
		expect(to.written.map((c) => c.name)).toEqual(["kept"]);
		expect(run.cleared).toEqual([]);
	});

	it("moves and clears only other sites, never Paradev's own", async () => {
		const from = store([
			cookie({ domain: ".github.com", hostOnly: false }),
			cookie({ name: "app", domain: "api.superset.sh" }),
		]);
		const to = store();
		const run = move(from, to, join(dir, "copied"), [
			"http://localhost:3000/a",
			"https://app.paradev.com/x",
			"about:blank",
		]);

		await run.copied;
		expect(to.written.map((c) => c.name)).toEqual(["sid"]);
		expect(run.cleared).toEqual([
			["https://github.com", "http://localhost:3000"],
		]);
	});

	it("tries a failed clean-up again on the next start, without copying again", async () => {
		const from = store([cookie({ domain: "a.test" })]);
		const to = store();
		const markerPath = join(dir, "copied");
		const attempts: string[][] = [];
		const run = (fail: boolean) =>
			movePaneSitesOnce({
				from,
				to,
				markerPath,
				readVisitedUrls: () => [],
				clearOldSites: async (origins) => {
					attempts.push(origins);
					if (fail) throw new Error("clear failed");
				},
			});

		await expect(run(true)).rejects.toThrow("clear failed");
		await run(false);
		await run(false);

		expect(to.written).toHaveLength(1);
		expect(attempts).toEqual([["https://a.test"], ["https://a.test"]]);
	});
});
