import { describe, expect, it } from "bun:test";
import { createBoxLogScrub } from "./box-log-scrub";

// Made-up values in the shapes a real box's managed environment holds.
const VALUES = {
	DATABASE_URL:
		"postgresql://app_owner:npg_Q7r/T2mWx9KpL@ep-quiet-sky-a1b2c3d4-pooler.us-east-2.aws.neon.tech/app",
	LINEAR_CLIENT_SECRET: "3f9a1c0e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39",
	DB_PASSWORD: 'p@ss"w\\rd/2024+x=y&z',
	SHORT_PIN: "8213",
};
const scrub = createBoxLogScrub(VALUES);

describe("createBoxLogScrub", () => {
	it("leaves an operational line as it is", () => {
		for (const line of [
			"1795305352803 host.exec 2.0.11+78482465 node=/opt/superset/host/current/node",
			"[sandbox] start hook running (pid 2134) (command of 25 chars)",
			"[host-service] listening on http://[::]:4879",
			"1795305369241 memguard rank pid=2152 bun -900->500",
		]) {
			expect(scrub(line)).toBe(line);
		}
	});

	it("withholds a line that holds twelve characters of a value in a row, in any form", () => {
		const secret = VALUES.LINEAR_CLIENT_SECRET;
		for (const line of [
			`client ${secret}`,
			`tail: ${secret.slice(9, 21)}`,
			`json ${JSON.stringify(VALUES.DB_PASSWORD)}`,
			`url ?p=${encodeURIComponent(VALUES.DB_PASSWORD)}`,
			`hex ${Buffer.from(secret).toString("hex").slice(6, 40)}`,
			`b64 ${Buffer.from(`x${secret}`).toString("base64")}`,
			"password npg_Q7r/T2mWx9KpL alone",
		]) {
			expect(scrub(line)).toBeNull();
		}
	});

	it("redacts a value of any length after its key name", () => {
		expect(scrub("pin SHORT_PIN=8213 ok")).toBe("pin SHORT_PIN=[redacted] ok");
		expect(scrub('{"SHORT_PIN":"8213"}')).toBe('{"SHORT_PIN":[redacted]}');
		expect(scrub("SHORT_PIN: 8213")).toBe("SHORT_PIN: [redacted]");
	});

	it("withholds a line with a private key header", () => {
		expect(scrub("-----BEGIN OPENSSH PRIVATE KEY-----")).toBeNull();
	});

	it("does not find a short value without its key", () => {
		expect(scrub("listening on 8213")).toBe("listening on 8213");
	});
});
