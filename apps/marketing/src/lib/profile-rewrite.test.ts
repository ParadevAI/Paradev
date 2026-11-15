import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { rewriteProfile } from "./profile-rewrite";

const request = new NextRequest("https://paradev.com/zz-not-a-page?ref=test");

describe("rewriteProfile", () => {
	test("returns 404 before rendering a missing profile in either locale", async () => {
		for (const locale of ["en", "ja"]) {
			const response = await rewriteProfile(
				request,
				locale,
				"zz-not-a-page",
				async () => null,
			);
			expect(response.status).toBe(404);
			expect(response.headers.get("x-middleware-rewrite")).toBe(
				`https://paradev.com/${locale}/user/zz-not-a-page?ref=test`,
			);
			expect(response.headers.get("x-robots-tag")).toBe("noindex");
		}
	});

	test("preserves a successful response for an existing profile", async () => {
		const response = await rewriteProfile(
			request,
			"en",
			"kitenite",
			async () => ({ handle: "kitenite" }),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("x-robots-tag")).toBeNull();
	});

	test("lets the page handle an API failure without declaring it missing", async () => {
		const response = await rewriteProfile(
			request,
			"en",
			"kitenite",
			async () => {
				throw new Error("upstream unavailable");
			},
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("x-robots-tag")).toBeNull();
	});
});
