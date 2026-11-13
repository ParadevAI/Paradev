import { describe, expect, test } from "bun:test";
import { resolveProjectIconUrl } from "./resolveProjectIconUrl";

describe("resolveProjectIconUrl", () => {
	test("custom icon wins over the GitHub avatar", () => {
		expect(
			resolveProjectIconUrl({
				icon: "data:image/png;base64,AAAA",
				repoOwner: "acme",
			}),
		).toBe("data:image/png;base64,AAAA");
	});

	test("falls back to the GitHub owner avatar when no custom icon", () => {
		expect(resolveProjectIconUrl({ icon: null, repoOwner: "acme" })).toBe(
			"https://github.com/acme.png?size=64",
		);
	});

	test("returns null when there is neither a custom icon nor a repo owner", () => {
		expect(resolveProjectIconUrl({ icon: null, repoOwner: null })).toBeNull();
	});

	test("does not throw for a host row without repositories", () => {
		expect(
			resolveProjectIconUrl({
				icon: null,
				primaryRepositoryId: "x",
				repositories: undefined,
			} as unknown as Parameters<typeof resolveProjectIconUrl>[0]),
		).toBeNull();
	});

	test("the 'none' sentinel suppresses the GitHub avatar fallback", () => {
		expect(
			resolveProjectIconUrl({ icon: "none", repoOwner: "acme" }),
		).toBeNull();
	});
});

describe("resolveProjectIconUrl with repositories", () => {
	test("uses the primary repository's owner", () => {
		expect(
			resolveProjectIconUrl({
				icon: null,
				primaryRepositoryId: "web",
				repositories: [
					{ id: "api", owner: "other" },
					{ id: "web", owner: "acme" },
				],
			}),
		).toBe("https://github.com/acme.png?size=64");
	});

	test("falls back to the first repository when the primary is missing", () => {
		expect(
			resolveProjectIconUrl({
				icon: null,
				primaryRepositoryId: "gone",
				repositories: [{ id: "api", owner: "acme" }],
			}),
		).toBe("https://github.com/acme.png?size=64");
	});
});
