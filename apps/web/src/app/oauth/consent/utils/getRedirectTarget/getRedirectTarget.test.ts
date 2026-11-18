import { describe, expect, it } from "bun:test";
import { getRedirectTarget } from "./getRedirectTarget";

describe("getRedirectTarget", () => {
	it("returns the host of a registered remote redirect", () => {
		expect(
			getRedirectTarget("https://evil.example/cb", ["https://evil.example/cb"]),
		).toEqual({ host: "evil.example", isLocal: false });
	});

	it("treats localhost and 127.0.0.1 on any port as local", () => {
		expect(
			getRedirectTarget("http://127.0.0.1:53121/callback", [
				"http://localhost:3118/callback",
			]),
		).toEqual({ host: "localhost", isLocal: true });
	});

	it("ignores a redirect the client did not register", () => {
		expect(
			getRedirectTarget("https://claude.ai/cb", ["https://evil.example/cb"]),
		).toBeNull();
	});

	it("ignores a missing or malformed redirect", () => {
		expect(getRedirectTarget(undefined, ["https://a.example/cb"])).toBeNull();
		expect(getRedirectTarget("not a url", ["https://a.example/cb"])).toBeNull();
	});
});
