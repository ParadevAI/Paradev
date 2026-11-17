import { describe, expect, test } from "bun:test";
import {
	AGENT_RELEASE_COOLDOWN_MS,
	type GithubRelease,
	pickCooledRelease,
} from "./produce";

const NOW = Date.parse("2026-11-17T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ASSET = "tool-linux-x64.tar.gz";

function release(
	tag: string,
	daysAgo: number,
	overrides: Partial<GithubRelease> & { assetDaysAgo?: number } = {},
): GithubRelease {
	const { assetDaysAgo = daysAgo, ...rest } = overrides;
	return {
		tag_name: tag,
		published_at: new Date(NOW - daysAgo * DAY).toISOString(),
		draft: false,
		prerelease: false,
		assets: [
			{
				name: ASSET,
				digest: `sha256:${"a".repeat(64)}`,
				browser_download_url: `https://example.invalid/${tag}/${ASSET}`,
				updated_at: new Date(NOW - assetDaysAgo * DAY).toISOString(),
			},
		],
		...rest,
	};
}

const pick = (releases: GithubRelease[]) =>
	pickCooledRelease(releases, ASSET, NOW)?.version;

describe("pickCooledRelease", () => {
	test("takes the highest version past the cooldown, not the newest or the one GitHub marks latest", () => {
		expect(AGENT_RELEASE_COOLDOWN_MS).toBe(3 * DAY);
		expect(
			pick([
				release("v2.3.1", 1),
				release("v2.3.0", 4),
				release("v1.19.6", 3.5),
				release("v2.2.9", 10),
			]),
		).toBe("2.3.0");
	});

	test("skips drafts, prereleases, other tags and releases without the asset", () => {
		expect(
			pick([
				release("v3.0.0", 5, { draft: true }),
				release("v2.9.0", 5, { prerelease: true }),
				release("v2.8.0-rc.1", 5),
				release("process-daemon-v9.0.0", 5),
				release("v2.7.0", 5, { assets: [] }),
				release("v2.6.0", 5),
			]),
		).toBe("2.6.0");
	});

	test("an asset replaced on an old release waits out the cooldown again", () => {
		expect(
			pick([release("v2.0.0", 30, { assetDaysAgo: 1 }), release("v1.9.0", 30)]),
		).toBe("1.9.0");
	});

	test("nothing past the cooldown picks nothing", () => {
		expect(pick([release("v1.0.0", 2.9)])).toBeUndefined();
	});
});
