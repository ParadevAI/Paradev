import { describe, expect, test } from "bun:test";
import { bareWebUrl } from "./bareWebUrl";

describe("bareWebUrl", () => {
	test.each([
		["changelog.autentic.ai", "https://changelog.autentic.ai/"],
		[
			"changelog.autentic.ai/releases/42",
			"https://changelog.autentic.ai/releases/42",
		],
		[
			"example.com/blog/[slug]?ref=chat",
			"https://example.com/blog/[slug]?ref=chat",
		],
		["docs.example.io:8443/guide", "https://docs.example.io:8443/guide"],
		["  example.com  ", "https://example.com/"],
	])("%s opens %s", (text, url) => {
		expect(bareWebUrl(text)).toBe(url);
	});

	test.each([
		["src/app.ts"],
		["README.md"],
		["vite.config.ts"],
		["go.mod"],
		["App.vue"],
		["schema.prisma"],
		["main.tf"],
		["notes.ai:12:4"],
		["notes.ai#L10"],
		["app/[slug]/page.tsx"],
		["/Users/me/site.com"],
		["~/notes.com"],
		[".env.local"],
		["https://example.com"],
		["localhost:3000"],
		["Dockerfile"],
		[""],
	])("%s is not a web host", (text) => {
		expect(bareWebUrl(text)).toBeNull();
	});
});
