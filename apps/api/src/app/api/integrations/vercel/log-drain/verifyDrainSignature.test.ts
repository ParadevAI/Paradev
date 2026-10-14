import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { verifyDrainSignature } from "./verifyDrainSignature";

const SECRET = "drain-secret";
const BODY = '[{"id":"1","source":"static"}]';
const SIGNATURE = createHmac("sha1", SECRET).update(BODY).digest("hex");

describe("verifyDrainSignature", () => {
	test("accepts the HMAC-SHA1 hex of the raw body", () => {
		expect(
			verifyDrainSignature({
				body: BODY,
				signature: SIGNATURE,
				secret: SECRET,
			}),
		).toBe(true);
	});

	test("rejects a missing, wrong-secret, tampered or truncated signature", () => {
		const wrongSecret = createHmac("sha1", "other").update(BODY).digest("hex");
		for (const [body, signature] of [
			[BODY, null],
			[BODY, wrongSecret],
			[`${BODY} `, SIGNATURE],
			[BODY, SIGNATURE.slice(0, -1)],
		] as const) {
			expect(verifyDrainSignature({ body, signature, secret: SECRET })).toBe(
				false,
			);
		}
	});
});
