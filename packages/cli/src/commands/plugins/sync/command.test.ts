import { describe, expect, test } from "bun:test";
import { organizationChanges } from "./command";

const api = {} as never;
const signedIn = async () => ({ api }) as never;

describe("organizationChanges", () => {
	test("signed out, the organization's plugins go unchecked without an error", async () => {
		const result = await organizationChanges(async () => {
			throw new Error("not logged in");
		});
		expect(result).toEqual({ text: "", failed: [] });
	});

	test("signed in, a failed check is an error so the desktop retries", async () => {
		const result = await organizationChanges(signedIn, async () => {
			throw new Error("fetch failed");
		});
		expect(result.error).toBe("fetch failed");
	});

	test("signed in, a plugin that could not be fetched is listed", async () => {
		const result = await organizationChanges(signedIn, async () => ({
			installed: [],
			removed: [],
			failed: ["deployer"],
		}));
		expect(result.failed).toEqual(["deployer"]);
		expect(result.error).toBeUndefined();
	});
});
