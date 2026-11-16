import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as crypto from "../../router/plugins/crypto";

// The stored clients for one issuer and redirect are the only database read, so
// the table is a list here; a registration is a POST to the registration
// endpoint, intercepted at `globalThis.fetch`.

let rows: Array<Record<string, unknown>> = [];
let inserted: Array<Record<string, unknown>> = [];
let registrations: Array<Record<string, unknown>> = [];

const selectChain = {
	from: () => selectChain,
	where: () => selectChain,
	orderBy: () => Promise.resolve(rows),
};

const insertChain = {
	values: (values: Record<string, unknown>) => {
		inserted.push(values);
		return insertChain;
	},
	onConflictDoUpdate: () => Promise.resolve(),
};

stub(db, { select: () => selectChain, insert: () => insertChain });

stub(crypto, {
	decryptOptional: (value: string | null) => Promise.resolve(value),
	encryptOptional: (value: string | null | undefined) =>
		Promise.resolve(value ?? null),
});

const { ForgottenClientError, resolveClientIdentity } = await import(
	"./client-identity"
);
const { exchangeCode } = await import("./index");
const { connectorMethod, requireConnector } = await import("./index");

const ISSUER = "https://api.useautumn.com/api/auth";
const REDIRECT = "https://api.test/api/connectors/callback/autumn_mcp";
const SCOPES = ["offline_access", "plans:read", "rewards:read"];

const server = {
	resource: "https://mcp.useautumn.com/mcp",
	issuer: ISSUER,
	metadata: {
		issuer: ISSUER,
		authorization_endpoint: `${ISSUER}/oauth2/authorize`,
		token_endpoint: `${ISSUER}/oauth2/token`,
		registration_endpoint: `${ISSUER}/oauth2/register`,
		token_endpoint_auth_methods_supported: ["client_secret_post"],
	},
};

const method = {
	type: "oauth2",
	client: "dynamic",
	scopes: SCOPES,
	scope_separator: " ",
} as never;

function client(overrides: Record<string, unknown> = {}) {
	return {
		issuer: ISSUER,
		redirectUri: REDIRECT,
		clientId: "old-client",
		clientSecret: "old-secret",
		clientSecretExpiresAt: null,
		tokenEndpointAuthMethod: "client_secret_post",
		scopes: null,
		...overrides,
	};
}

const resolve = (choice: Parameters<typeof resolveClientIdentity>[4]) =>
	resolveClientIdentity(
		"autumn_mcp",
		server as never,
		method,
		REDIRECT,
		choice,
	);

const realFetch = globalThis.fetch;
afterAll(() => {
	globalThis.fetch = realFetch;
});

beforeEach(() => {
	rows = [];
	inserted = [];
	registrations = [];
	globalThis.fetch = (async (_input: string | URL, init?: RequestInit) => {
		registrations.push(JSON.parse(String(init?.body)));
		return new Response(
			JSON.stringify({
				client_id: "new-client",
				client_secret: "new-secret",
				token_endpoint_auth_method: "client_secret_post",
			}),
			{ status: 201, headers: { "content-type": "application/json" } },
		);
	}) as typeof fetch;
});

describe("a new grant", () => {
	test("registers a new client when the stored one lacks a requested scope", async () => {
		rows = [client({ scopes: ["offline_access", "plans:read"] })];

		const identity = await resolve({ newGrant: true });

		expect(identity.clientId).toBe("new-client");
		expect(registrations[0]?.scope).toBe(SCOPES.join(" "));
		expect(inserted[0]).toMatchObject({
			clientId: "new-client",
			scopes: SCOPES,
		});
	});

	test("does not trust a client whose scopes were never recorded", async () => {
		rows = [client()];

		expect((await resolve({ newGrant: true })).clientId).toBe("new-client");
	});

	test("reuses a stored client registered for every requested scope", async () => {
		rows = [
			client(),
			client({ clientId: "scoped-client", scopes: [...SCOPES, "extra"] }),
		];

		expect(await resolve({ newGrant: true })).toEqual({
			clientId: "scoped-client",
			clientSecret: "old-secret",
			authentication: "post",
		});
		expect(registrations).toHaveLength(0);
	});
});

describe("an issued grant", () => {
	test("keeps the client it was issued to, scopes or not", async () => {
		rows = [client(), client({ clientId: "scoped-client", scopes: SCOPES })];

		expect((await resolve({ issuedTo: "old-client" })).clientId).toBe(
			"old-client",
		);
		expect(registrations).toHaveLength(0);
	});

	test("one from before client ids were recorded uses the oldest client", async () => {
		rows = [client(), client({ clientId: "scoped-client", scopes: SCOPES })];

		expect((await resolve({ issuedTo: null })).clientId).toBe("old-client");
		expect(registrations).toHaveLength(0);
	});

	test("one from before client ids were recorded never moves to a newer client", async () => {
		rows = [
			client({ clientSecretExpiresAt: new Date(0) }),
			client({ clientId: "scoped-client", scopes: SCOPES }),
		];
		await expect(resolve({ issuedTo: null })).rejects.toBeInstanceOf(
			ForgottenClientError,
		);

		rows = [client({ clientId: "scoped-client", scopes: SCOPES })];
		await expect(resolve({ issuedTo: null })).rejects.toBeInstanceOf(
			ForgottenClientError,
		);
		expect(registrations).toHaveLength(0);
	});

	test("whose client is gone is not handed another one", async () => {
		rows = [client({ clientId: "scoped-client", scopes: SCOPES })];

		await expect(resolve({ issuedTo: "old-client" })).rejects.toBeInstanceOf(
			ForgottenClientError,
		);
		expect(registrations).toHaveLength(0);
	});
});

describe("ahrefs_mcp, which declares client_secret_post", () => {
	const AHREFS = "https://api.ahrefs.com/";
	const AHREFS_REDIRECT = "https://api.test/api/connectors/callback/ahrefs_mcp";
	const ahrefs = connectorMethod(requireConnector("ahrefs_mcp"));
	let tokenRequests: Array<{ headers: Headers; body: URLSearchParams }> = [];

	const routes: Record<string, unknown> = {
		"https://api.ahrefs.com/.well-known/oauth-protected-resource/mcp/mcp": {
			resource: AHREFS,
			authorization_servers: [AHREFS],
		},
		"https://api.ahrefs.com/.well-known/oauth-authorization-server": {
			issuer: AHREFS,
			authorization_endpoint: "https://app.ahrefs.com/web/oauth/authorize",
			token_endpoint: "https://ahrefs.com/oauth/token",
			registration_endpoint: "https://api.ahrefs.com/mcp/register",
			code_challenge_methods_supported: ["S256"],
			grant_types_supported: ["implicit", "authorization_code"],
		},
	};

	beforeEach(() => {
		tokenRequests = [];
		globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
			const url = String(input);
			if (url === "https://api.ahrefs.com/mcp/register") {
				const body = JSON.parse(String(init?.body));
				registrations.push(body);
				return Response.json({
					client_id: "s0+9mC/zxw==",
					client_secret: "Fbmr+ShP/caa==",
					token_endpoint_auth_method: body.token_endpoint_auth_method,
				});
			}
			if (url === "https://ahrefs.com/oauth/token") {
				tokenRequests.push({
					headers: new Headers(init?.headers),
					body: new URLSearchParams(String(init?.body)),
				});
				return Response.json({
					access_token: "ahrefs-token",
					token_type: "Bearer",
				});
			}
			const route = routes[url];
			return route === undefined
				? new Response("no route", { status: 404 })
				: Response.json(route);
		}) as typeof fetch;
	});

	const exchange = (clientId: string | null) =>
		exchangeCode("ahrefs_mcp", ahrefs, {
			code: "the-code",
			redirectUri: AHREFS_REDIRECT,
			codeVerifier: "the-verifier",
			clientId,
		});

	const ahrefsClient = (overrides: Record<string, unknown> = {}) =>
		client({
			issuer: AHREFS,
			redirectUri: AHREFS_REDIRECT,
			scopes: ["apiv3-mcp"],
			...overrides,
		});

	test("registers with the declared method, not the default basic", async () => {
		const identity = await resolveClientIdentity(
			"ahrefs_mcp",
			{
				resource: AHREFS,
				issuer: AHREFS,
				metadata:
					routes[
						"https://api.ahrefs.com/.well-known/oauth-authorization-server"
					],
			} as never,
			ahrefs,
			AHREFS_REDIRECT,
			{ newGrant: true },
		);

		expect(registrations[0]?.token_endpoint_auth_method).toBe(
			"client_secret_post",
		);
		expect(identity.authentication).toBe("post");
	});

	test("replaces a stored basic client on a new connect", async () => {
		rows = [ahrefsClient({ tokenEndpointAuthMethod: "client_secret_basic" })];

		const identity = await resolveClientIdentity(
			"ahrefs_mcp",
			{
				resource: AHREFS,
				issuer: AHREFS,
				metadata:
					routes[
						"https://api.ahrefs.com/.well-known/oauth-authorization-server"
					],
			} as never,
			ahrefs,
			AHREFS_REDIRECT,
			{ newGrant: true },
		);

		expect(identity.clientId).toBe("s0+9mC/zxw==");
		expect(registrations).toHaveLength(1);
	});

	test("sends the client id and secret in the body, with no Basic header", async () => {
		rows = [
			ahrefsClient({
				clientId: "s0+9mC/zxw==",
				clientSecret: "Fbmr+ShP/caa==",
			}),
		];

		const tokens = await exchange("s0+9mC/zxw==");

		expect(tokens.accessToken).toBe("ahrefs-token");
		const [request] = tokenRequests;
		expect(request?.headers.get("authorization")).toBeNull();
		expect(request?.body.get("client_id")).toBe("s0+9mC/zxw==");
		expect(request?.body.get("client_secret")).toBe("Fbmr+ShP/caa==");
		expect(request?.body.get("code")).toBe("the-code");
		expect(request?.body.get("code_verifier")).toBe("the-verifier");
		expect(request?.body.get("redirect_uri")).toBe(AHREFS_REDIRECT);
	});

	test("a code issued to a stored basic client is still redeemed in the body", async () => {
		rows = [
			ahrefsClient({
				clientId: "basic+client",
				clientSecret: "basic/secret=",
				tokenEndpointAuthMethod: "client_secret_basic",
			}),
		];

		await exchange("basic+client");

		const [request] = tokenRequests;
		expect(request?.headers.get("authorization")).toBeNull();
		expect(request?.body.get("client_id")).toBe("basic+client");
		expect(request?.body.get("client_secret")).toBe("basic/secret=");
		expect(registrations).toHaveLength(0);
	});
});
