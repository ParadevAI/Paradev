import { describe, expect, it } from "bun:test";
import { supersedeStagedUpdate } from "./supersede-staged-update";

function setup(latestVersion: Promise<string | null>) {
	const downloads: string[] = [];
	return {
		downloads,
		options: {
			stagedVersion: "1.2.0",
			fetchLatestVersion: () => latestVersion,
			startDownload: (version: string) => {
				downloads.push(version);
			},
		},
	};
}

describe("supersedeStagedUpdate", () => {
	it("downloads a release that differs from the staged one", async () => {
		const { downloads, options } = setup(Promise.resolve("1.3.0"));

		expect(await supersedeStagedUpdate(options)).toBe(true);
		expect(downloads).toEqual(["1.3.0"]);
	});

	it("keeps the staged update when it is still the latest", async () => {
		const { downloads, options } = setup(Promise.resolve("1.2.0"));

		expect(await supersedeStagedUpdate(options)).toBe(false);
		expect(downloads).toEqual([]);
	});

	it("keeps the staged update when the feed offers nothing", async () => {
		const { downloads, options } = setup(Promise.resolve(null));

		expect(await supersedeStagedUpdate(options)).toBe(false);
		expect(downloads).toEqual([]);
	});

	it("keeps the staged update when the feed cannot be read", async () => {
		const { downloads, options } = setup(Promise.reject(new Error("offline")));

		expect(await supersedeStagedUpdate(options)).toBe(false);
		expect(downloads).toEqual([]);
	});

	it("does not download once the caller abandoned the check", async () => {
		const { downloads, options } = setup(Promise.resolve("1.3.0"));

		expect(
			await supersedeStagedUpdate({ ...options, isAbandoned: () => true }),
		).toBe(false);
		expect(downloads).toEqual([]);
	});

	it("ignores an answer that arrives after the timeout", async () => {
		const feed = Promise.withResolvers<string | null>();
		const { downloads, options } = setup(feed.promise);

		expect(await supersedeStagedUpdate({ ...options, timeoutMs: 1 })).toBe(
			false,
		);
		feed.resolve("1.3.0");
		await feed.promise;
		await Promise.resolve();

		expect(downloads).toEqual([]);
	});
});
