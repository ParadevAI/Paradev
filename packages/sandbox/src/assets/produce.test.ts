import { describe, expect, test } from "bun:test";
import { type GithubRelease, pickRelease } from "./produce";

const ASSET = "tool-linux-x64.tar.gz";

function release(
	tag: string,
	overrides: Partial<GithubRelease> = {},
): GithubRelease {
	return {
		tag_name: tag,
		draft: false,
		prerelease: false,
		assets: [
			{
				name: ASSET,
				digest: `sha256:${"a".repeat(64)}`,
				browser_download_url: `https://example.invalid/${tag}/${ASSET}`,
			},
		],
		...overrides,
	};
}

const pick = (releases: GithubRelease[]) =>
	pickRelease(releases, ASSET)?.version;

describe("pickRelease", () => {
	test("takes the highest version, not the first listed or an older line's newer patch", () => {
		expect(
			pick([release("v1.19.6"), release("v2.3.0"), release("v2.2.9")]),
		).toBe("2.3.0");
	});

	test("skips drafts, prereleases, other tags and releases without the asset", () => {
		expect(
			pick([
				release("v3.0.0", { draft: true }),
				release("v2.9.0", { prerelease: true }),
				release("v2.8.0-rc.1"),
				release("process-daemon-v9.0.0"),
				release("v2.7.0", { assets: [] }),
				release("v2.6.0"),
			]),
		).toBe("2.6.0");
	});

	test("no stable release picks nothing", () => {
		expect(pick([release("v1.0.0", { prerelease: true })])).toBeUndefined();
	});
});
