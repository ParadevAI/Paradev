import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import proxy from "./proxy";

function allowedOrigin(origin: string) {
	const response = proxy(
		new NextRequest("https://api.test/api/trpc/user.me", {
			method: "OPTIONS",
			headers: { origin },
		}),
	);
	return response.headers.get("Access-Control-Allow-Origin");
}

describe("API CORS", () => {
	test("admits the configured web origin and its twin on the other root domain", () => {
		expect(allowedOrigin("https://app.superset.sh")).toBe(
			"https://app.superset.sh",
		);
		expect(allowedOrigin("https://app.paradev.com")).toBe(
			"https://app.paradev.com",
		);
	});

	test("refuses a lookalike origin", () => {
		expect(allowedOrigin("https://app.paradev.com.evil.example")).toBe("");
	});
});
