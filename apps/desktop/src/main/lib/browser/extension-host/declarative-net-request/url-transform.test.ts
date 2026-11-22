import { expect, test } from "bun:test";
import { applyUrlTransform } from "./url-transform";

test("a transform applies each component", () => {
	expect(
		applyUrlTransform("http://a.example/x?utm=1&id=2", {
			scheme: "https",
			host: "b.example",
			port: "8443",
			queryTransform: { removeParams: ["utm"] },
		}),
	).toBe("https://b.example:8443/x?id=2");
});

test("a host, port or scheme the URL cannot take fails the redirect", () => {
	const url = "https://a.example/x";
	expect(applyUrlTransform(url, { host: "b .example" })).toBeNull();
	expect(applyUrlTransform(url, { host: "b.example/evil" })).toBeNull();
	expect(applyUrlTransform(url, { host: "b.example:99" })).toBeNull();
	expect(applyUrlTransform(url, { port: "80abc" })).toBeNull();
	expect(applyUrlTransform(url, { port: "70000" })).toBeNull();
	expect(applyUrlTransform(url, { scheme: "chrome-extension" })).toBeNull();
});

test("a malformed host fails the redirect instead of throwing", () => {
	const url = "https://a.example/x";
	expect(applyUrlTransform(url, { host: "[::1]/evil" })).toBeNull();
	expect(applyUrlTransform(url, { host: 5 as never })).toBeNull();
	expect(applyUrlTransform(url, { host: "[::1]" })).toBe("https://[::1]/x");
});
