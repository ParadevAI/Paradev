import { describe, expect, test } from "bun:test";
import { detectLanguage } from "./detect-language";

describe("detectLanguage", () => {
	test("detects dotenv files as shell", () => {
		expect(detectLanguage(".env")).toBe("shell");
		expect(detectLanguage(".env.local")).toBe("shell");
		expect(detectLanguage(".env.production")).toBe("shell");
		expect(detectLanguage("apps/web/.env.test")).toBe("shell");
		expect(detectLanguage("C:\\repo\\.ENV.LOCAL")).toBe("shell");
		expect(detectLanguage("production.env")).toBe("shell");
	});

	test("keeps a known extension ahead of the dotenv prefix", () => {
		expect(detectLanguage(".env.json")).toBe("json");
		expect(detectLanguage("env.d.ts")).toBe("typescript");
	});

	test("does not treat other files ending in an env variant as shell", () => {
		expect(detectLanguage("config.local")).toBe("plaintext");
		expect(detectLanguage("settings.test")).toBe("plaintext");
		expect(detectLanguage("env.local")).toBe("plaintext");
	});
});
