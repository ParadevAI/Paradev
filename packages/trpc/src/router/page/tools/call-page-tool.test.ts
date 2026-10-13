import { describe, expect, test } from "bun:test";
import type { SelectPage } from "@superset/db/schema";
import {
	AmbiguousPluginError,
	PluginNotInstalledError,
	type PluginTarget,
	PluginTargetError,
} from "../../plugins/proxy";
import {
	type CallPageToolDeps,
	callPageTool,
	pageToolAccess,
	pinForGrant,
} from "./call-page-tool";

const INPUT = {
	pageId: "page-1",
	userId: "viewer-1",
	organizationId: "org-1",
	plugin: "neon",
	tool: "run_sql",
	args: { sql: "select 1" },
};

const FIRST_PARTY = {
	plugin: "gmail",
	version: "1.0.0",
	kind: "first-party",
	build: {},
	secrets: {},
	connectionId: "conn-9",
	account: { connectionId: "conn-9", accountLabel: "work@acme.com" },
} as unknown as PluginTarget;

const REMOTE: PluginTarget = {
	plugin: "neon",
	version: "1.0.0",
	kind: "remote",
	url: "https://mcp.neon.tech/mcp",
	headers: {},
	connectionId: "conn-1",
};

function deps(overrides: Partial<CallPageToolDeps> = {}): CallPageToolDeps & {
	resolved: unknown[];
	called: unknown[];
	pins: unknown[];
} {
	const resolved: unknown[] = [];
	const called: unknown[] = [];
	const pins: unknown[] = [];
	return {
		resolved,
		called,
		pins,
		findGrant: async () => ({ connectionId: null }),
		resolveTarget: async (request) => {
			resolved.push(request);
			return REMOTE;
		},
		callTool: async (target, tool, args) => {
			called.push({ target, tool, args });
			return { content: [{ type: "text", text: "1" }] };
		},
		pluginInfo: async () => ({ label: "Neon", accountless: false }),
		pinGrant: async (...args) => {
			pins.push(args);
			return true;
		},
		...overrides,
	};
}

describe("callPageTool", () => {
	test("no grant asks for one and never reaches the proxy", async () => {
		const d = deps({ findGrant: async () => null });
		expect(await callPageTool(d, INPUT)).toEqual({
			status: "needs_grant",
			pluginLabel: "Neon",
		});
		expect(d.resolved).toEqual([]);
	});

	test("a plugin with no account says so when it asks for a grant", async () => {
		const d = deps({
			findGrant: async () => null,
			pluginInfo: async () => ({ label: "Exa", accountless: true }),
		});
		expect(await callPageTool(d, INPUT)).toEqual({
			status: "needs_grant",
			pluginLabel: "Exa",
			accountless: true,
		});
	});

	test("a grant made before any account pins the one account, then runs", async () => {
		const events: string[] = [];
		const d = deps({
			resolveTarget: async () => FIRST_PARTY,
			pinGrant: async (pageId, userId, plugin, connectionId) => {
				events.push(`pin ${pageId} ${userId} ${plugin} ${connectionId}`);
				return true;
			},
			callTool: async () => {
				events.push("call");
				return "done";
			},
		});
		expect(await callPageTool(d, INPUT)).toEqual({
			status: "ok",
			result: "done",
		});
		expect(events).toEqual(["pin page-1 viewer-1 neon conn-9", "call"]);
	});

	test("a pinned grant is not pinned again", async () => {
		const d = deps({
			findGrant: async () => ({ connectionId: "conn-9" }),
			resolveTarget: async () => FIRST_PARTY,
		});
		await callPageTool(d, INPUT);
		expect(d.pins).toEqual([]);
		expect(d.called).toHaveLength(1);
	});

	test("a granted call runs as the viewer and returns the result", async () => {
		const d = deps();
		expect(await callPageTool(d, INPUT)).toEqual({
			status: "ok",
			result: { content: [{ type: "text", text: "1" }] },
		});
		expect(d.resolved).toEqual([
			{
				userId: "viewer-1",
				organizationId: "org-1",
				plugin: "neon",
				connectionId: null,
			},
		]);
		expect(d.called).toEqual([
			{ target: REMOTE, tool: "run_sql", args: { sql: "select 1" } },
		]);
		expect(d.pins).toEqual([]);
	});

	test("the grant's account is the one used", async () => {
		const d = deps({ findGrant: async () => ({ connectionId: "conn-2" }) });
		await callPageTool(d, INPUT);
		expect((d.resolved[0] as { connectionId: string }).connectionId).toBe(
			"conn-2",
		);
	});

	test("an unknown plugin is invalid and never reaches the grant or proxy", async () => {
		let grantChecked = false;
		const d = deps({
			pluginInfo: async () => null,
			findGrant: async () => {
				grantChecked = true;
				return null;
			},
		});
		expect(await callPageTool(d, { ...INPUT, plugin: "Neon Admin" })).toEqual({
			status: "error",
			code: "invalid",
			message: "Unknown plugin",
		});
		expect(grantChecked).toBe(false);
		expect(d.resolved).toEqual([]);
	});

	const NEEDS_AUTH: PluginTarget = {
		plugin: "neon",
		version: "1.0.0",
		kind: "needs-auth",
		connector: "neon_mcp",
		connectUrl: "https://app.superset.sh/connect/neon_mcp",
	};

	test("a lost pinned account asks again even with one account left", async () => {
		const resolved: unknown[] = [];
		const d = deps({
			findGrant: async () => ({ connectionId: "gone" }),
			resolveTarget: async (request) => {
				resolved.push(request.connectionId);
				return request.connectionId
					? NEEDS_AUTH
					: {
							...REMOTE,
							account: { connectionId: "conn-1", accountLabel: "me@home.com" },
						};
			},
		});
		expect(await callPageTool(d, INPUT)).toEqual({
			status: "needs_account",
			pluginLabel: "Neon",
			accounts: [{ connectionId: "conn-1", label: "me@home.com" }],
		});
		expect(resolved).toEqual(["gone", null]);
		expect(d.called).toEqual([]);
	});

	test("a lost pinned account asks again when a first-party account is left", async () => {
		const d = deps({
			findGrant: async () => ({ connectionId: "gone" }),
			resolveTarget: async (request) =>
				request.connectionId ? NEEDS_AUTH : FIRST_PARTY,
		});
		expect(await callPageTool(d, INPUT)).toEqual({
			status: "needs_account",
			pluginLabel: "Neon",
			accounts: [{ connectionId: "conn-9", label: "work@acme.com" }],
		});
		expect(d.called).toEqual([]);
	});

	test("a lost pinned account with several left asks for one", async () => {
		const d = deps({
			findGrant: async () => ({ connectionId: "gone" }),
			resolveTarget: async (request) =>
				request.connectionId
					? NEEDS_AUTH
					: {
							plugin: "neon",
							version: "1.0.0",
							kind: "multi",
							connector: "neon_mcp",
							connectorLabel: "Neon",
							accounts: [{ connectionId: "a" }, { connectionId: "b" }],
							resolve: async () => REMOTE,
						},
		});
		expect(await callPageTool(d, INPUT)).toMatchObject({
			status: "needs_account",
			accounts: [{ connectionId: "a" }, { connectionId: "b" }],
		});
		expect(d.called).toEqual([]);
	});

	test("a lost pinned account with none left asks to connect", async () => {
		const d = deps({
			findGrant: async () => ({ connectionId: "gone" }),
			resolveTarget: async () => NEEDS_AUTH,
		});
		expect(await callPageTool(d, INPUT)).toEqual({
			status: "needs_connection",
			pluginLabel: "Neon",
			connectUrl: "https://app.superset.sh/connect/neon_mcp",
		});
		expect(d.called).toEqual([]);
	});

	function racedPin(savedConnectionId: string, liveIds: string[]) {
		const resolved: unknown[] = [];
		let reads = 0;
		const d = deps({
			findGrant: async () => {
				reads += 1;
				return { connectionId: reads === 1 ? null : savedConnectionId };
			},
			resolveTarget: async (request) => {
				resolved.push(request.connectionId);
				const id = request.connectionId ?? "conn-a";
				if (!liveIds.includes(id)) return NEEDS_AUTH;
				return {
					...REMOTE,
					connectionId: id,
					account: { connectionId: id, accountLabel: `${id}@acme.com` },
				};
			},
			pinGrant: async () => false,
		});
		return { d, resolved };
	}

	test("a pin lost to another request runs on the saved account, never the one resolved first", async () => {
		const { d, resolved } = racedPin("conn-b", ["conn-a", "conn-b"]);
		expect((await callPageTool(d, INPUT)).status).toBe("ok");
		expect(resolved).toEqual([null, "conn-b"]);
		expect(d.called).toEqual([
			expect.objectContaining({
				target: expect.objectContaining({ connectionId: "conn-b" }),
			}),
		]);
	});

	test("a pin lost to an account that is gone asks again and runs nothing", async () => {
		const { d, resolved } = racedPin("conn-b", ["conn-a"]);
		expect(await callPageTool(d, INPUT)).toEqual({
			status: "needs_account",
			pluginLabel: "Neon",
			accounts: [{ connectionId: "conn-a", label: "conn-a@acme.com" }],
		});
		expect(resolved).toEqual([null, "conn-b", null]);
		expect(d.called).toEqual([]);
	});

	test("a pin another request saved to the same account runs without resolving again", async () => {
		const { d, resolved } = racedPin("conn-a", ["conn-a"]);
		expect((await callPageTool(d, INPUT)).status).toBe("ok");
		expect(resolved).toEqual([null]);
		expect(d.called).toHaveLength(1);
	});

	test("a grant revoked while pinning asks for a grant and runs nothing", async () => {
		let reads = 0;
		const d = deps({
			findGrant: async () => {
				reads += 1;
				return reads === 1 ? { connectionId: null } : null;
			},
			resolveTarget: async () => FIRST_PARTY,
			pinGrant: async () => false,
		});
		expect(await callPageTool(d, INPUT)).toEqual({
			status: "needs_grant",
			pluginLabel: "Neon",
		});
		expect(d.called).toEqual([]);
	});

	test("not installed asks to install", async () => {
		const d = deps({
			resolveTarget: async () => {
				throw new PluginNotInstalledError('"neon" is not installed.');
			},
		});
		expect(await callPageTool(d, INPUT)).toEqual({
			status: "needs_install",
			pluginLabel: "Neon",
		});
	});

	test("not connected asks to connect, with the connect URL", async () => {
		const d = deps({
			resolveTarget: async () => ({
				plugin: "neon",
				version: "1.0.0",
				kind: "needs-auth",
				connector: "neon_mcp",
				connectUrl: "https://app.superset.sh/connect/neon_mcp",
			}),
		});
		expect(await callPageTool(d, INPUT)).toEqual({
			status: "needs_connection",
			pluginLabel: "Neon",
			connectUrl: "https://app.superset.sh/connect/neon_mcp",
		});
	});

	test("a multi-account target asks for an account", async () => {
		const d = deps({
			resolveTarget: async () => ({
				plugin: "neon",
				version: "1.0.0",
				kind: "multi",
				connector: "neon_mcp",
				connectorLabel: "Neon",
				accounts: [
					{ connectionId: "a", accountLabel: "work@acme.com" },
					{ connectionId: "b", accountLabel: "me@home.com" },
				],
				resolve: async () => REMOTE,
			}),
		});
		const reply = await callPageTool(d, INPUT);
		expect(reply.status).toBe("needs_account");
		expect(
			reply.status === "needs_account" &&
				reply.accounts.map((a) => a.connectionId),
		).toEqual(["a", "b"]);
		expect(d.called).toEqual([]);
		expect(d.pins).toEqual([]);
	});

	test("two marketplaces with the plugin is invalid", async () => {
		const d = deps({
			resolveTarget: async () => {
				throw new AmbiguousPluginError("neon", ["superset", "acme"]);
			},
		});
		expect(await callPageTool(d, INPUT)).toMatchObject({
			status: "error",
			code: "invalid",
		});
	});

	test("any other proxy refusal is unavailable", async () => {
		const d = deps({
			resolveTarget: async () => {
				throw new PluginTargetError("provider down", 502);
			},
		});
		expect(await callPageTool(d, INPUT)).toEqual({
			status: "error",
			code: "unavailable",
			message: "provider down",
		});
	});

	test("a proxy refusal while building the server is unavailable", async () => {
		const d = deps({
			callTool: async () => {
				throw new PluginTargetError("no mcp url", 501);
			},
		});
		expect(await callPageTool(d, INPUT)).toEqual({
			status: "error",
			code: "unavailable",
			message: "no mcp url",
		});
	});

	test("a failing tool call is tool_error", async () => {
		const d = deps({
			callTool: async () => {
				throw new Error("relation does not exist");
			},
		});
		expect(await callPageTool(d, INPUT)).toEqual({
			status: "error",
			code: "tool_error",
			message: "relation does not exist",
		});
	});
});

describe("callPageTool isError results", () => {
	const failing = (result: unknown) => deps({ callTool: async () => result });

	test("a result with isError becomes tool_error with the tool text", async () => {
		const d = failing({
			isError: true,
			content: [
				{ type: "text", text: " relation missing " },
				{ type: "image", data: "x" },
				{ type: "text", text: "try again" },
			],
		});
		expect(await callPageTool(d, INPUT)).toEqual({
			status: "error",
			code: "tool_error",
			message: "relation missing \ntry again",
		});
	});

	test("long tool text is cut to 1000 characters", async () => {
		const d = failing({
			isError: true,
			content: [{ type: "text", text: "a".repeat(1500) }],
		});
		const reply = await callPageTool(d, INPUT);
		expect(reply).toMatchObject({ status: "error", code: "tool_error" });
		expect(reply.status === "error" && reply.message.length).toBe(1000);
	});

	test("an isError result with no text gets a default message", async () => {
		expect(
			await callPageTool(failing({ isError: true, content: [] }), INPUT),
		).toEqual({
			status: "error",
			code: "tool_error",
			message: "The tool reported an error",
		});
	});

	test("a result with isError false stays ok", async () => {
		const result = { isError: false, content: [] };
		expect(await callPageTool(failing(result), INPUT)).toEqual({
			status: "ok",
			result,
		});
	});
});

describe("pinForGrant", () => {
	test("pins the one account a first-party or remote target runs on", () => {
		expect(pinForGrant(FIRST_PARTY)).toBe("conn-9");
		expect(
			pinForGrant({ ...REMOTE, account: { connectionId: "conn-1" } }),
		).toBe("conn-1");
	});

	test("pins nothing for a plugin with no connector", () => {
		expect(pinForGrant(REMOTE)).toBeNull();
	});

	test("pins nothing when the viewer has several accounts or none", () => {
		expect(
			pinForGrant({
				plugin: "neon",
				version: "1.0.0",
				kind: "multi",
				connector: "neon_mcp",
				connectorLabel: "Neon",
				accounts: [{ connectionId: "a" }, { connectionId: "b" }],
				resolve: async () => REMOTE,
			}),
		).toBeNull();
		expect(
			pinForGrant({
				plugin: "neon",
				version: "1.0.0",
				kind: "needs-auth",
				connector: "neon_mcp",
				connectUrl: "https://app.superset.sh/connect/neon_mcp",
			}),
		).toBeNull();
	});
});

function page(overrides: Partial<SelectPage> = {}): SelectPage {
	return {
		visibility: "org",
		createdByUserId: "owner-1",
		takenDownAt: null,
		...overrides,
	} as SelectPage;
}

describe("pageToolAccess", () => {
	test("a page outside the active organization never reaches the proxy", () => {
		expect(pageToolAccess(undefined, "viewer-1")).toBe("not_found");
	});

	test("a taken-down page is not found", () => {
		expect(pageToolAccess(page({ takenDownAt: new Date() }), "viewer-1")).toBe(
			"not_found",
		);
	});

	test("someone else's just_me page is not found", () => {
		expect(pageToolAccess(page({ visibility: "just_me" }), "viewer-1")).toBe(
			"not_found",
		);
	});

	test("the owner reaches their own just_me page", () => {
		expect(pageToolAccess(page({ visibility: "just_me" }), "owner-1")).toBe(
			"ok",
		);
	});

	test("an org page is readable by a member", () => {
		expect(pageToolAccess(page(), "viewer-1")).toBe("ok");
	});
});
