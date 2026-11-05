import { describe, expect, test } from "bun:test";
import type { ApiClient } from "../../../../types";
import { resolveNamingInstructions } from "./naming-instructions";

function apiReturning(
	query: () => Promise<{ namingInstructions?: string | null }>,
) {
	let calls = 0;
	const api = {
		userSettings: {
			get: {
				query: () => {
					calls += 1;
					return query();
				},
			},
		},
	} as unknown as Pick<ApiClient, "userSettings">;
	return { api, calls: () => calls };
}

const project = {
	namingInstructions: "Include the ticket id.",
	ignoreGlobalNamingInstructions: false,
};

describe("resolveNamingInstructions", () => {
	test("returns the global text with the project text", async () => {
		const { api } = apiReturning(async () => ({
			namingInstructions: "Prefix with feat/.",
		}));
		expect(await resolveNamingInstructions(api, project)).toEqual({
			global: "Prefix with feat/.",
			project: "Include the ticket id.",
		});
	});

	test("a project that ignores the global text does not ask the API for it", async () => {
		const { api, calls } = apiReturning(async () => ({
			namingInstructions: "Prefix with feat/.",
		}));
		expect(
			await resolveNamingInstructions(api, {
				...project,
				ignoreGlobalNamingInstructions: true,
			}),
		).toEqual({ global: null, project: "Include the ticket id." });
		expect(calls()).toBe(0);
	});

	test("an unreachable API, or one without the field, means no global text", async () => {
		const failing = apiReturning(async () => {
			throw new Error("offline");
		});
		expect(await resolveNamingInstructions(failing.api, project)).toEqual({
			global: null,
			project: "Include the ticket id.",
		});

		const old = apiReturning(async () => ({}));
		expect(await resolveNamingInstructions(old.api, undefined)).toEqual({
			global: null,
			project: null,
		});
	});
});
