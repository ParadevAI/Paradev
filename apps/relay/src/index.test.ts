/// <reference types="bun" />
import { afterAll, beforeEach, expect, test } from "bun:test";
import relay from "./index";

type ProxiedRequest = {
	method: string;
	pathWithQuery: string;
	headers?: Record<string, string>;
};

const proxied: ProxiedRequest[] = [];
const proxiedHeaders: Record<string, string>[] = [];
let boxAccess: unknown = { allowed: false, reason: "host_closed" };
let apiDown = false;
let apiCalls = 0;
const BOX_CREDENTIAL = `11111111-2222-4333-8444-555555555555.${"a".repeat(43)}`;
const FORGED_CREDENTIAL = `11111111-2222-4333-8444-555555555555.${"b".repeat(43)}`;

const tunnel = {
	setName: async () => {},
	proxyHttp: async (_caller: unknown, request: ProxiedRequest) => {
		proxied.push({
			method: request.method,
			pathWithQuery: request.pathWithQuery,
		});
		proxiedHeaders.push(request.headers ?? {});
		return {
			ok: true,
			status: 200,
			headers: { "content-type": "application/json" },
			body: new TextEncoder().encode("{}"),
		};
	},
};

const keyPair = await crypto.subtle.generateKey(
	{
		name: "RSASSA-PKCS1-v1_5",
		modulusLength: 2048,
		publicExponent: new Uint8Array([1, 0, 1]),
		hash: "SHA-256",
	},
	true,
	["sign", "verify"],
);
const jwk = {
	...(await crypto.subtle.exportKey("jwk", keyPair.publicKey)),
	kid: "test",
	alg: "RS256",
};
const jwks = Bun.serve({
	port: 0,
	fetch: (request) => {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/api/trpc/host.cloudWorkspaceAccess")) {
			apiCalls++;
			if (apiDown) return new Response("down", { status: 502 });
			if (
				request.headers.get("x-superset-sandbox-credential") !== BOX_CREDENTIAL
			) {
				return Response.json(
					[
						{
							error: {
								json: {
									message: "no",
									code: -32001,
									data: { code: "UNAUTHORIZED", httpStatus: 401 },
								},
							},
						},
					],
					{ status: 401 },
				);
			}
			return Response.json([{ result: { data: { json: boxAccess } } }]);
		}
		return Response.json({ keys: [jwk] });
	},
});
const apiUrl = `http://localhost:${jwks.port}`;

afterAll(() => jwks.stop(true));

beforeEach(() => {
	proxied.length = 0;
	proxiedHeaders.length = 0;
	boxAccess = { allowed: false, reason: "host_closed" };
	apiDown = false;
	apiCalls = 0;
});

const hostId = "org-1:machine-1";
const env = {
	NEXT_PUBLIC_API_URL: apiUrl,
	HostTunnel: {
		idFromName: (name: string) => name,
		get: () => tunnel,
	},
	PLACEMENT: {
		get: async () => ({
			name: `${hostId}#1`,
			generation: 1,
			continent: "EU",
			colo: "AMS",
		}),
	},
};
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

function base64url(data: string | ArrayBuffer): string {
	return Buffer.from(
		typeof data === "string" ? data : new Uint8Array(data),
	).toString("base64url");
}

async function token(): Promise<string> {
	const header = base64url(JSON.stringify({ alg: "RS256", kid: "test" }));
	const payload = base64url(
		JSON.stringify({
			sub: "user-1",
			organizationIds: ["org-1"],
			iss: apiUrl,
			aud: apiUrl,
			exp: Math.floor(Date.now() / 1000) + 300,
		}),
	);
	const signature = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		keyPair.privateKey,
		new TextEncoder().encode(`${header}.${payload}`),
	);
	return `${header}.${payload}.${base64url(signature)}`;
}

const handler = relay as unknown as {
	fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response>;
};

async function call(
	path: string,
	init: Omit<RequestInit, "headers"> & {
		authorized?: boolean;
		host?: string;
		headers?: Record<string, string>;
	} = {},
) {
	const { authorized = true, host = hostId, ...requestInit } = init;
	const headers = authorized
		? { ...requestInit.headers, Authorization: `Bearer ${await token()}` }
		: requestInit.headers;
	return handler.fetch(
		new Request(`https://relay.test/hosts/${host}${path}`, {
			...requestInit,
			headers,
		}),
		env,
		ctx,
	);
}

test("forwards chat-v3 tRPC POST and GET calls to the host", async () => {
	const post = await call("/chat-v3/trpc/prompt", {
		method: "POST",
		body: JSON.stringify({ sessionId: "s1" }),
	});
	const get = await call("/chat-v3/trpc/listSessions?input=%7B%7D");

	expect(post.status).toBe(200);
	expect(get.status).toBe(200);
	expect(proxied).toEqual([
		{ method: "POST", pathWithQuery: "/chat-v3/trpc/prompt" },
		{ method: "GET", pathWithQuery: "/chat-v3/trpc/listSessions?input=%7B%7D" },
	]);
});

test("still forwards the host tRPC router", async () => {
	const response = await call("/trpc/workspace.list", { method: "POST" });

	expect(response.status).toBe(200);
	expect(proxied).toEqual([
		{ method: "POST", pathWithQuery: "/trpc/workspace.list" },
	]);
});

test("does not forward HTTP to host paths outside the tRPC routers", async () => {
	const post = await call("/chat-v3/sessions/s1/stream", { method: "POST" });
	const get = await call("/chat-v3/sessions/s1/stream");

	expect(post.status).toBe(404);
	expect(get.status).toBe(426);
	expect(proxied).toEqual([]);
});

test("rejects an unauthenticated chat-v3 call with a plain-JSON tRPC error", async () => {
	const response = await call("/chat-v3/trpc/prompt", {
		method: "POST",
		authorized: false,
	});

	expect(response.status).toBe(401);
	expect(await response.json()).toEqual({
		error: {
			message: "Unauthorized",
			code: -32001,
			data: { code: "UNAUTHORIZED", httpStatus: 401 },
		},
	});
	expect(proxied).toEqual([]);
});

test("rejects a stream path that a percent-encoded host id leaks into", async () => {
	const response = await call("/chat-v3/sessions/s1/stream", {
		host: encodeURIComponent(hostId),
		headers: { Upgrade: "websocket" },
	});

	expect(response.status).toBe(400);
});

function callAsBox(
	path: string,
	init: { credential?: string; headers?: Record<string, string> } = {},
) {
	return call(path, {
		method: "POST",
		authorized: false,
		headers: {
			"x-superset-sandbox-credential": init.credential ?? BOX_CREDENTIAL,
			...init.headers,
		},
	});
}

test("a cloud workspace reaches a host that allowed it, and its credential stays at the relay", async () => {
	boxAccess = { allowed: true, userId: "user-1", workspaceId: "ws-1" };

	const response = await callAsBox("/trpc/workspace.list");

	expect(response.status).toBe(200);
	expect(proxied).toEqual([
		{ method: "POST", pathWithQuery: "/trpc/workspace.list" },
	]);
	expect(proxiedHeaders[0]?.["x-superset-user-id"]).toBe("user-1");
	expect(proxiedHeaders[0]?.["x-superset-sandbox-credential"]).toBeUndefined();
});

test("a cloud workspace is refused by a host that did not allow it, and told why", async () => {
	const response = await callAsBox("/trpc/workspace.list");

	expect(response.status).toBe(403);
	expect(JSON.stringify(await response.json())).toContain(
		"does not accept cloud workspaces",
	);
	expect(proxied).toEqual([]);
});

test("a credential the API does not accept is unauthorized", async () => {
	const response = await callAsBox("/trpc/workspace.list", {
		credential: FORGED_CREDENTIAL,
	});

	expect(response.status).toBe(401);
	expect(proxied).toEqual([]);
});

test("a cloud workspace cannot open a stream, even to a host that allowed it", async () => {
	boxAccess = { allowed: true, userId: "user-1", workspaceId: "ws-1" };

	const response = await call("/terminal/t1", {
		authorized: false,
		headers: {
			"x-superset-sandbox-credential": BOX_CREDENTIAL,
			Upgrade: "websocket",
		},
	});

	expect(response.status).toBe(403);
	expect(apiCalls).toBe(0);
});

test("a malformed credential is unauthorized without asking the API", async () => {
	const response = await callAsBox("/trpc/workspace.list", {
		credential: "anything",
	});

	expect(response.status).toBe(401);
	expect(apiCalls).toBe(0);
});

test("an API outage during the box's access check is a server error, not an auth failure", async () => {
	apiDown = true;

	const response = await callAsBox("/trpc/workspace.list");

	expect(response.status).toBe(500);
	expect(JSON.stringify(await response.json())).toContain(
		"INTERNAL_SERVER_ERROR",
	);
	expect(proxied).toEqual([]);
});
