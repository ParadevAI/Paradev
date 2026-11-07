import { expect, test } from "bun:test";
import { parseExtensionId } from "./parseExtensionId";

const ID = "bcjindcccaagfpapjjmafapmmgkkhgoa";

test("reads the ID from a bare ID or a Web Store URL, and rejects anything else", () => {
	expect(parseExtensionId(ID)).toBe(ID);
	expect(
		parseExtensionId(
			`https://chromewebstore.google.com/detail/json-formatter/${ID}?hl=en`,
		),
	).toBe(ID);
	expect(() => parseExtensionId("json-formatter")).toThrow();
	expect(() => parseExtensionId(`${ID}x`)).toThrow();
});
