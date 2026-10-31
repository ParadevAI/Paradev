import { describe, expect, it } from "bun:test";
import {
	FINGERPRINT_READ_CONCURRENCY,
	readClaudeFingerprints,
	shareInFlight,
} from "./logins";
import type { ClaudeProfile } from "./profiles";
import { usageRouter } from "./usage";

function profile(
	configDir: string,
	credentialKind: ClaudeProfile["credentialKind"] = "subscription",
): ClaudeProfile {
	return {
		configDir,
		sourceLabel: configDir,
		email: null,
		credentialKind,
		loginFingerprint:
			credentialKind === "api_key" ? `marker:${configDir}` : null,
		credentialsPath: `${configDir}/.credentials.json`,
		keychainServices: [],
	};
}

describe("usage.logins", () => {
	it("has the 15 s budget of usage.quota, not the 5 s default", () => {
		expect(usageRouter._def.procedures.logins._def.meta).toEqual({
			timeoutMs: 15_000,
		});
	});
});

describe("shareInFlight", () => {
	it("gives a call made while a scan runs that scan's result", async () => {
		const scans: Array<(value: string) => void> = [];
		const read = shareInFlight(
			() => new Promise<string>((resolve) => scans.push(resolve)),
		);
		const first = read();
		const second = read();
		expect(scans).toHaveLength(1);
		scans[0]?.("scan 1");
		expect(await first).toBe("scan 1");
		expect(await second).toBe("scan 1");
	});

	it("starts a new scan once the last one has settled", async () => {
		let scans = 0;
		const read = shareInFlight(async () => ++scans);
		expect(await read()).toBe(1);
		expect(await read()).toBe(2);
	});

	it("starts a new scan after a failed one", async () => {
		let scans = 0;
		const read = shareInFlight(async () => {
			scans++;
			if (scans === 1) throw new Error("scan failed");
			return scans;
		});
		await expect(read()).rejects.toThrow("scan failed");
		expect(await read()).toBe(2);
	});
});

describe("readClaudeFingerprints", () => {
	it("reads a bounded number of profiles at once and keeps their order", async () => {
		const profiles = Array.from({ length: 10 }, (_, index) =>
			profile(`/profiles/${index}`, index === 3 ? "api_key" : "subscription"),
		);
		const waiting: Array<() => void> = [];
		const read: string[] = [];
		let inFlight = 0;
		let peak = 0;
		let settled = false;
		const result = readClaudeFingerprints(profiles, async (configDir) => {
			read.push(configDir);
			inFlight++;
			peak = Math.max(peak, inFlight);
			await new Promise<void>((resolve) => waiting.push(resolve));
			inFlight--;
			return `token:${configDir}`;
		}).finally(() => {
			settled = true;
		});
		while (!settled) {
			await new Promise((resolve) => setTimeout(resolve, 0));
			for (const resolve of waiting.splice(0).reverse()) resolve();
		}

		expect(peak).toBe(FINGERPRINT_READ_CONCURRENCY);
		expect(read).not.toContain("/profiles/3");
		expect((await result).map((login) => login.fingerprint)).toEqual(
			profiles.map(({ configDir, credentialKind }) =>
				credentialKind === "api_key"
					? `marker:${configDir}`
					: `token:${configDir}`,
			),
		);
	});
});
