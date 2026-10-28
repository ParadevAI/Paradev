import { describe, expect, it } from "bun:test";
import { normalizeUrl } from "./normalizeUrl";

describe("normalizeUrl", () => {
	it("adds a scheme to bare hosts", () => {
		expect(normalizeUrl("example.com/a")).toBe("https://example.com/a");
		expect(normalizeUrl("localhost:3000")).toBe("http://localhost:3000");
		expect(normalizeUrl("api.dev:8080")).toBe("https://api.dev:8080");
	});

	it("keeps real schemes and refuses script and data URLs", () => {
		expect(normalizeUrl("https://x.dev")).toBe("https://x.dev");
		expect(normalizeUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
		expect(normalizeUrl("javascript:alert(1)")).toBeNull();
		expect(normalizeUrl("data:text/html,hi")).toBeNull();
	});
});
