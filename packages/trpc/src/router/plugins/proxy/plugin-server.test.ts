import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	CallToolRequestSchema,
	type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { at } from "../../../../test/at";
import { buildPluginServer, endUpstreamSessions } from "./plugin-server";
import { type PluginTarget, PluginTargetError } from "./resolve-target";
import type { ResumableSession, UpstreamSessions } from "./upstream-sessions";

const TOOL: Tool = {
	name: "send_email",
	description: "Sends a new email immediately",
	inputSchema: {
		type: "object",
		properties: { body: { type: "string" } },
		required: ["body"],
	},
};

const ACCOUNTS = [
	{ connectionId: "id-personal", userLabel: "satya@gmail.com" },
	{ connectionId: "id-work", userLabel: "work" },
];

interface Call {
	name: string;
	args: Record<string, unknown>;
	credential: string;
}

function hostedTarget(connectionId: string, calls: Call[]): PluginTarget {
	return {
		kind: "first-party",
		plugin: "gmail",
		version: "1.0.0",
		connectionId,
		secrets: {
			accessToken: `token-${connectionId}`,
			refreshToken: null,
			config: {},
		} as never,
		build: {
			getTools: () => [TOOL],
			credential: (secrets) => secrets.accessToken ?? "",
			callTool: async (name, args, credential) => {
				calls.push({ name, args, credential });
				return { content: [{ type: "text", text: `sent with ${credential}` }] };
			},
		},
	};
}

function expiredTarget(): PluginTarget {
	return {
		kind: "needs-auth",
		plugin: "gmail",
		version: "1.0.0",
		connector: "google",
		connectUrl: "https://api.superset.test/api/connectors/google/connect",
		reason: "the token expired",
	};
}

async function connect(
	target: PluginTarget,
	rejected: string[] = [],
	sessions?: UpstreamSessions,
) {
	const server = await buildPluginServer(target, {
		sessions,
		recordRejection: async (connectionId) => {
			rejected.push(connectionId);
		},
	});
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	const client = new Client({ name: "test", version: "1.0.0" });
	await Promise.all([
		server.connect(serverTransport),
		client.connect(clientTransport),
	]);
	return {
		client,
		close: async () => {
			await client.close();
			await server.close();
		},
	};
}

let layoutsBuilt = 0;

// The server caches each account layout by plugin version, so every target
// gets its own version to keep one test's layout out of the next.
function multiTarget(
	resolve: (connectionId: string) => Promise<PluginTarget>,
	hosted?: PluginTarget extends { hosted?: infer H } ? H : never,
): PluginTarget {
	return {
		kind: "multi",
		plugin: "gmail",
		version: `1.0.${++layoutsBuilt}`,
		connector: "google",
		connectorLabel: "Google",
		accounts: ACCOUNTS,
		...(hosted ? { hosted } : {}),
		resolve,
	};
}

describe("a plugin server with two accounts", () => {
	test("advertises one tool list with the account as a required argument", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => hostedTarget(id, calls)),
		);

		try {
			const { tools } = await client.listTools();
			expect(tools).toHaveLength(1);
			expect(at(tools).name).toBe("send_email");

			const properties = at(tools).inputSchema.properties as Record<
				string,
				Record<string, unknown>
			>;
			expect(properties.superset_account?.enum).toEqual([
				"id-personal",
				"id-work",
			]);
			expect(at(tools).inputSchema.required).toContain("superset_account");
			expect(client.getInstructions()).toContain("2 accounts");
		} finally {
			await close();
		}
	});

	test("runs the call under the chosen account and forwards no account argument", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => hostedTarget(id, calls)),
		);

		try {
			const result = await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-personal", body: "hi" },
			});

			expect(calls).toHaveLength(1);
			expect(at(calls).args).toEqual({ body: "hi" });
			expect(at(calls).credential).toBe("token-id-personal");
			expect(result.isError).toBeFalsy();
			expect(JSON.stringify(result.content)).toContain("token-id-personal");
			expect(JSON.stringify(result.content)).toContain(
				"(acted as satya@gmail.com)",
			);
			expect(result._meta).toMatchObject({ superset_account: "id-personal" });
		} finally {
			await close();
		}
	});

	test("the label picks the right account", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => hostedTarget(id, calls)),
		);

		try {
			await client.callTool({
				name: "send_email",
				arguments: { superset_account: "work", body: "hi" },
			});
			expect(at(calls).credential).toBe("token-id-work");
		} finally {
			await close();
		}
	});

	test("a call with no account is a tool error naming the choices, not a transport failure", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => hostedTarget(id, calls)),
		);

		try {
			const result = await client.callTool({
				name: "send_email",
				arguments: { body: "hi" },
			});

			expect(result.isError).toBe(true);
			expect(JSON.stringify(result.content)).toContain("pass superset_account");
			expect(JSON.stringify(result.content)).toContain("id-work (work)");
			expect(calls).toHaveLength(0);
		} finally {
			await close();
		}
	});

	test("an account the caller does not have is a tool error", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => hostedTarget(id, calls)),
		);

		try {
			const result = await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-someone-else", body: "hi" },
			});

			expect(result.isError).toBe(true);
			expect(JSON.stringify(result.content)).toContain(
				"is not a connected Google account",
			);
			expect(calls).toHaveLength(0);
		} finally {
			await close();
		}
	});

	test("an expired account returns its reconnect link and leaves the other working", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) =>
				id === "id-personal" ? expiredTarget() : hostedTarget(id, calls),
			),
		);

		try {
			const expired = await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-personal", body: "hi" },
			});
			expect(expired.isError).toBe(true);
			expect(JSON.stringify(expired.content)).toContain(
				"needs to be reconnected",
			);
			expect(JSON.stringify(expired.content)).toContain(
				"/api/connectors/google/connect",
			);

			const live = await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-work", body: "hi" },
			});
			expect(live.isError).toBeFalsy();
			expect(calls).toHaveLength(1);
		} finally {
			await close();
		}
	});

	test("the tool list comes from a live account when the first one is expired", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) =>
				id === "id-work" ? expiredTarget() : hostedTarget(id, calls),
			),
		);

		try {
			const { tools } = await client.listTools();
			expect(tools).toHaveLength(1);
			expect(at(tools).inputSchema.required).toContain("superset_account");
		} finally {
			await close();
		}
	});
});

describe("a plugin server with one account", () => {
	test("is unchanged: no account argument anywhere", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(hostedTarget("id-work", calls));

		try {
			const { tools } = await client.listTools();
			expect(at(tools).inputSchema.properties).not.toHaveProperty(
				"superset_account",
			);
			expect(at(tools).inputSchema.required).toEqual(["body"]);

			const result = await client.callTool({
				name: "send_email",
				arguments: { body: "hi" },
			});
			expect(result.isError).toBeFalsy();
			expect(at(calls).args).toEqual({ body: "hi" });
			expect(at(calls).credential).toBe("token-id-work");
		} finally {
			await close();
		}
	});
});

describe("which account the tool list comes from", () => {
	test("a hosted plugin asks no account what its tools are", async () => {
		const resolved: string[] = [];
		const calls: Call[] = [];
		const hosted = {
			getTools: () => [TOOL],
			credential: () => "c",
			callTool: async () => ({ content: [] }),
		};
		const { client, close } = await connect(
			multiTarget(async (id) => {
				resolved.push(id);
				return hostedTarget(id, calls);
			}, hosted as never),
		);

		try {
			const { tools } = await client.listTools();
			expect(tools).toHaveLength(1);
			const properties = at(tools).inputSchema.properties as Record<
				string,
				{ enum: string[] }
			>;
			expect(properties.superset_account?.enum).toEqual([
				"id-personal",
				"id-work",
			]);
			expect(resolved).toEqual([]);
		} finally {
			await close();
		}
	});

	test("an account whose credential was rejected is not offered", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) =>
				id === "id-personal" ? expiredTarget() : hostedTarget(id, calls),
			),
		);

		try {
			const { tools } = await client.listTools();
			const properties = at(tools).inputSchema.properties as Record<
				string,
				{ enum: string[] }
			>;

			expect(properties.superset_account?.enum).toEqual(["id-work"]);
		} finally {
			await close();
		}
	});

	test("an account the vendor could not answer for is still offered", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => {
				if (id === "id-personal") throw new Error("socket hang up");
				return hostedTarget(id, calls);
			}),
		);

		try {
			const { tools } = await client.listTools();
			const properties = at(tools).inputSchema.properties as Record<
				string,
				{ enum: string[] }
			>;

			expect(properties.superset_account?.enum).toEqual([
				"id-personal",
				"id-work",
			]);
		} finally {
			await close();
		}
	});
});

describe("a vendor rejecting the credential mid-session", () => {
	function rejectingTarget(
		connectionId: string,
	): Extract<PluginTarget, { kind: "first-party" }> {
		return {
			kind: "first-party",
			plugin: "gmail",
			version: "1.0.0",
			connectionId,
			secrets: {
				accessToken: "revoked",
				refreshToken: null,
				config: {},
			} as never,
			build: {
				getTools: () => [TOOL],
				credential: () => "revoked",
				callTool: async () => {
					throw Object.assign(
						new Error("Gmail API error: invalid credentials"),
						{
							code: 401,
						},
					);
				},
			},
		};
	}

	test("a single-account call answers with a reconnect result, not a protocol error", async () => {
		const { client, close } = await connect(rejectingTarget("id-work"));

		try {
			const result = await client.callTool({
				name: "send_email",
				arguments: { body: "hi" },
			});

			expect(result.isError).toBe(true);
			expect(JSON.stringify(result.content)).toContain(
				"Ask the user to reconnect it",
			);
		} finally {
			await close();
		}
	});

	test("a multi-account call marks the account and names it in the error", async () => {
		const rejected: string[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) =>
				id === "id-personal" ? rejectingTarget(id) : hostedTarget(id, []),
			),
			rejected,
		);

		try {
			const result = await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-personal", body: "hi" },
			});

			expect(result.isError).toBe(true);
			expect(JSON.stringify(result.content)).toContain("rejected");
			expect(JSON.stringify(result.content)).toContain("satya@gmail.com");
			expect(rejected).toEqual(["id-personal"]);
		} finally {
			await close();
		}
	});

	test("an error without a 401 code is a plain tool failure, nothing marked", async () => {
		const target = rejectingTarget("id-work");
		target.build.callTool = async () => {
			throw new Error("Gmail API error: backend blew up");
		};
		const { client, close } = await connect(target);

		try {
			await expect(
				client.callTool({ name: "send_email", arguments: { body: "hi" } }),
			).rejects.toThrow("backend blew up");
		} finally {
			await close();
		}
	});
});

describe("review regressions", () => {
	test("every account expired lists the authenticate tool with each reconnect link", async () => {
		const { client, close } = await connect(
			multiTarget(async () => expiredTarget()),
		);

		try {
			const { tools } = await client.listTools();
			expect(tools.map((tool) => tool.name)).toEqual(["authenticate"]);

			const result = await client.callTool({
				name: "authenticate",
				arguments: {},
			});
			expect(result.isError).toBe(true);
			expect(JSON.stringify(result.content)).toContain(
				"https://api.superset.test/api/connectors/google/connect",
			);
		} finally {
			await close();
		}
	});

	test("an account the provider cannot refresh is a tool error, not a transport failure", async () => {
		const { client, close } = await connect(
			multiTarget(async (id) => {
				if (id === "id-personal")
					throw new PluginTargetError("token endpoint down", 502);
				return hostedTarget(id, []);
			}),
		);

		try {
			const result = await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-personal", body: "hi" },
			});
			expect(result.isError).toBe(true);
			expect(JSON.stringify(result.content)).toContain("token endpoint down");
		} finally {
			await close();
		}
	});

	test("a vendor-owned superset_account is forwarded and the advertised name picks the account", async () => {
		const calls: Call[] = [];
		const owned: Tool = {
			...TOOL,
			inputSchema: {
				...TOOL.inputSchema,
				properties: {
					...TOOL.inputSchema.properties,
					superset_account: { type: "string" },
				},
			},
		};
		const { client, close } = await connect(
			multiTarget(async (id) => {
				const target = hostedTarget(id, calls);
				if (target.kind === "first-party")
					target.build.getTools = () => [owned];
				return target;
			}),
		);

		try {
			await client.listTools();
			const result = await client.callTool({
				name: "send_email",
				arguments: {
					superset_account: "ACC-123",
					superset_account_id: "id-work",
					body: "hi",
				},
			});
			expect(result.isError).toBeFalsy();
			expect(calls).toEqual([
				{
					name: "send_email",
					args: { superset_account: "ACC-123", body: "hi" },
					credential: "token-id-work",
				},
			]);
		} finally {
			await close();
		}
	});
});

describe("superset-home review", () => {
	const SEARCH: Tool = {
		name: "search",
		inputSchema: { type: "object", properties: {} },
	};

	test("a call resolves only the account it names once the tool list is known", async () => {
		const resolved: string[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => {
				resolved.push(id);
				return hostedTarget(id, []);
			}),
		);

		try {
			await client.listTools();
			resolved.length = 0;
			await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-work", body: "hi" },
			});
			expect(resolved).toEqual(["id-work"]);
		} finally {
			await close();
		}
	});

	test("an account that does not expose the tool is refused by name", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => {
				const target = hostedTarget(id, calls);
				if (target.kind === "first-party" && id === "id-personal")
					target.build.getTools = () => [SEARCH];
				return target;
			}),
		);

		try {
			await client.listTools();
			const result = await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-personal", body: "hi" },
			});
			expect(result.isError).toBe(true);
			expect(JSON.stringify(result.content)).toContain(
				"does not offer send_email",
			);
			expect(calls).toEqual([]);
		} finally {
			await close();
		}
	});
});

describe("a vendor that keeps state per MCP session", () => {
	const VENDOR_URL = "https://vendor.test/mcp";

	function stubVendor() {
		const live = new Map<string, WebStandardStreamableHTTPServerTransport>();
		const projects = new Map<string, string>();
		const vendor = {
			live,
			initialized: 0,
			deleted: [] as string[],
			resumedWith: [] as (string | null)[],
		};

		const open = async () => {
			vendor.initialized++;
			const transport = new WebStandardStreamableHTTPServerTransport({
				sessionIdGenerator: randomUUID,
				enableJsonResponse: true,
				onsessioninitialized: (id) => {
					live.set(id, transport);
				},
				onsessionclosed: (id) => {
					live.delete(id);
					vendor.deleted.push(id);
				},
			});
			const server = new Server(
				{ name: "vendor", version: "1.0.0" },
				{ capabilities: { tools: {} } },
			);
			server.setRequestHandler(
				CallToolRequestSchema,
				async (request, extra) => {
					const session = extra.sessionId ?? "";
					if (request.params.name === "switch_project")
						projects.set(session, String(request.params.arguments?.project));
					const text = projects.get(session) ?? "Default";
					return { content: [{ type: "text" as const, text }] };
				},
			);
			await server.connect(transport);
			return transport;
		};

		spyOn(globalThis, "fetch").mockImplementation((async (
			url: string,
			init?: RequestInit,
		) => {
			const request = new Request(url, init);
			const id = request.headers.get("mcp-session-id");
			if (!id) return (await open()).handleRequest(request);
			const transport = live.get(id);
			if (!transport) return new Response(null, { status: 404 });
			vendor.resumedWith.push(request.headers.get("mcp-protocol-version"));
			return transport.handleRequest(request);
		}) as typeof fetch);
		return vendor;
	}

	function memorySessions(): UpstreamSessions & {
		stored: Map<string, ResumableSession>;
	} {
		const stored = new Map<string, ResumableSession>();
		return {
			stored,
			get: async (connectionId) => stored.get(connectionId) ?? null,
			set: async (connectionId, session) => {
				stored.set(connectionId, session);
			},
			takeAll: async () => {
				const all = Object.fromEntries(stored);
				stored.clear();
				return all;
			},
		};
	}

	const remote: PluginTarget = {
		kind: "remote",
		plugin: "posthog",
		version: "1.0.0",
		url: VENDOR_URL,
		headers: {},
		connectionId: "id-posthog",
	};

	async function callOnce(
		sessions: UpstreamSessions | undefined,
		name: string,
		args: Record<string, unknown> = {},
	): Promise<string> {
		const { client, close } = await connect(remote, [], sessions);
		try {
			const result = await client.callTool({ name, arguments: args });
			return JSON.stringify(result.content);
		} finally {
			await close();
		}
	}

	afterEach(() => {
		(globalThis.fetch as unknown as { mockRestore(): void }).mockRestore();
	});

	test("a value set in one request is still there in the next", async () => {
		const vendor = stubVendor();
		const sessions = memorySessions();

		await callOnce(sessions, "switch_project", { project: "Production" });
		expect(await callOnce(sessions, "project_get")).toContain("Production");
		expect(vendor.initialized).toBe(1);
		expect(vendor.resumedWith.every(Boolean)).toBe(true);
	});

	test("two caller sessions on one connection get separate vendor sessions", async () => {
		stubVendor();
		const first = memorySessions();

		await callOnce(first, "switch_project", { project: "Production" });
		expect(await callOnce(memorySessions(), "project_get")).toContain(
			"Default",
		);
	});

	test("a session the vendor expired is opened again and the call runs", async () => {
		const vendor = stubVendor();
		const sessions = memorySessions();

		await callOnce(sessions, "switch_project", { project: "Production" });
		const expired = sessions.stored.get("id-posthog")?.sessionId ?? "";
		vendor.live.delete(expired);

		expect(await callOnce(sessions, "project_get")).toContain("Default");
		expect(sessions.stored.get("id-posthog")?.sessionId).not.toBe(expired);
	});

	test("ending the caller's session ends the vendor session", async () => {
		const vendor = stubVendor();
		const sessions = memorySessions();

		await callOnce(sessions, "switch_project", { project: "Production" });
		const { sessionId } = at([...sessions.stored.values()]);
		await endUpstreamSessions(remote, sessions);

		expect(vendor.deleted).toEqual([sessionId]);
		expect(sessions.stored.size).toBe(0);
	});

	test("a caller with no session ends the vendor session after each call", async () => {
		const vendor = stubVendor();

		await callOnce(undefined, "switch_project", { project: "Production" });

		expect(vendor.live.size).toBe(0);
		expect(vendor.deleted).toHaveLength(1);
	});
});
