import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import mcpHeadersCommand from "./command";

let previousOrgOverride: string | undefined;

function invoke(config: { organizationId?: string } = {}) {
	return mcpHeadersCommand.run({
		ctx: { bearer: "session-jwt", config } as never,
		args: {} as never,
		options: {} as never,
		signal: new AbortController().signal,
	}) as Promise<{ data: Record<string, string>; message: string }>;
}

beforeEach(() => {
	previousOrgOverride = process.env.SUPERSET_ORGANIZATION_ID;
	delete process.env.SUPERSET_ORGANIZATION_ID;
});

afterEach(() => {
	if (previousOrgOverride === undefined)
		delete process.env.SUPERSET_ORGANIZATION_ID;
	else process.env.SUPERSET_ORGANIZATION_ID = previousOrgOverride;
});

describe("auth mcp-headers", () => {
	test("names the terminal's organization, so a multi-org session token is accepted", async () => {
		process.env.SUPERSET_ORGANIZATION_ID = "org-terminal";
		const result = await invoke({ organizationId: "org-config" });

		expect(result.data).toEqual({
			Authorization: "Bearer session-jwt",
			[ORGANIZATION_HEADER]: "org-terminal",
		});
		expect(JSON.parse(result.message)).toEqual(result.data);
	});

	test("falls back to the active organization from config", async () => {
		const result = await invoke({ organizationId: "org-config" });

		expect(result.data[ORGANIZATION_HEADER]).toBe("org-config");
	});

	test("prints only Authorization when no organization is known", async () => {
		const result = await invoke();

		expect(result.data).toEqual({ Authorization: "Bearer session-jwt" });
	});
});
