import { describe, expect, test } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import { NOT_LOGGED_IN } from "../../../lib/resolve-auth";
import { organizationChanges } from "./command";

const api = {} as never;
const signedIn = async () => ({ api }) as never;

describe("organizationChanges", () => {
	test("signed out, every organization's plugins leave the machine", async () => {
		let forgot = false;
		const result = await organizationChanges(
			async () => {
				throw new CLIError(NOT_LOGGED_IN);
			},
			undefined,
			() => {
				forgot = true;
				return ["deploy"];
			},
		);
		expect(forgot).toBe(true);
		expect(result).toEqual({ text: " Removed: deploy.", failed: [] });
	});

	test("a sign-in that fails for another reason is an error, not a sign-out", async () => {
		let forgot = false;
		const result = await organizationChanges(
			async () => {
				throw new Error("token refresh failed");
			},
			undefined,
			() => {
				forgot = true;
				return [];
			},
		);
		expect(forgot).toBe(false);
		expect(result.error).toBe("token refresh failed");
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
