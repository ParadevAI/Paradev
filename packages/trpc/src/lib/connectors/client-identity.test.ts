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

	test("whose client is gone is not handed another one", async () => {
		rows = [client({ clientId: "scoped-client", scopes: SCOPES })];

		await expect(resolve({ issuedTo: "old-client" })).rejects.toBeInstanceOf(
			ForgottenClientError,
		);
		expect(registrations).toHaveLength(0);
	});
});
