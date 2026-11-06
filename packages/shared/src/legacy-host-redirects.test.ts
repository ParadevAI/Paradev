import { describe, expect, test } from "bun:test";
import { withLegacyHostRedirects } from "./legacy-host-redirects";

const redirects = [
	{ source: "/about", destination: "/team", permanent: true },
	{
		source: "/mcp",
		destination: "https://api.superset.sh/mcp",
		permanent: false,
	},
	{
		source: "/docs/:path*",
		destination: "https://docs.superset.sh/:path*",
		permanent: false,
	},
];

describe("withLegacyHostRedirects", () => {
	test("adds nothing while the root domain is superset.sh", () => {
		for (const site of ["marketing", "docs"] as const) {
			expect(
				withLegacyHostRedirects(redirects, { rootDomain: "superset.sh", site }),
			).toBe(redirects);
		}
	});

	test("moves the legacy marketing hosts to the new root domain", () => {
		const onLegacyHost = {
			type: "host" as const,
			value: "(?:superset\\.sh|www\\.superset\\.sh)",
		};
		expect(
			withLegacyHostRedirects(redirects, {
				rootDomain: "example.org",
				site: "marketing",
			}),
		).toEqual([
			{
				source: "/about",
				destination: "https://example.org/team",
				permanent: true,
				has: [onLegacyHost],
			},
			{ source: "/about", destination: "/team", permanent: true },
			{
				source: "/mcp",
				destination: "https://api.superset.sh/mcp",
				permanent: false,
			},
			{
				source: "/docs/:path*",
				destination: "https://docs.example.org/:path*",
				permanent: false,
			},
			{
				source:
					"/:path((?!(?:mcp|\\.well-known|api|ingest|monitoring)(?:/|$)).*)",
				has: [onLegacyHost],
				destination: "https://example.org/:path",
				permanent: true,
			},
		]);
	});

	test("moves the legacy docs host to docs on the new root domain", () => {
		const rules = withLegacyHostRedirects(
			[{ source: "/docs/:path*", destination: "/:path*", permanent: true }],
			{ rootDomain: "example.org", site: "docs" },
		);
		const onLegacyHost = {
			type: "host" as const,
			value: "(?:docs\\.superset\\.sh)",
		};
		expect(rules[0]).toEqual({
			source: "/docs/:path*",
			destination: "https://docs.example.org/:path*",
			permanent: true,
			has: [onLegacyHost],
		});
		expect(rules.at(-1)).toMatchObject({
			has: [onLegacyHost],
			destination: "https://docs.example.org/:path",
			permanent: true,
		});
	});
});
