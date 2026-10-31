import { db } from "@superset/db/client";
import { pluginOauthClients } from "@superset/db/schema";
import type { ConnectorMethod } from "@superset/shared/connectors";
import { CANONICAL_URLS } from "@superset/shared/constants";
import { and, asc, eq } from "drizzle-orm";
import { env } from "../../env";
import { decryptOptional, encryptOptional } from "../../router/plugins/crypto";
import { credentialFetch } from "../../router/plugins/manifest";
import type { DiscoveredServer } from "./discovery";

export interface ClientIdentity {
	clientId: string;
	clientSecret?: string;
	authentication?: "basic" | "post";
}

/**
 * Which client a token request goes out as. A new grant takes any client
 * registered for the scopes it asks for. A grant already issued is bound to its
 * client: `null` is one issued before that was recorded.
 */
export type ClientFor = { newGrant: true } | { issuedTo: string | null };

/** The client a grant was issued to no longer exists, so the grant cannot be refreshed. */
export class ForgottenClientError extends Error {
	constructor(issuer: string, clientId: string) {
		super(`${issuer} client ${clientId} is no longer registered.`);
		this.name = "ForgottenClientError";
	}
}

export function clientMetadataUrl(connectorSlug: string): string {
	const base = env.PLUGIN_CLIENT_METADATA_BASE_URL ?? env.NEXT_PUBLIC_API_URL;
	return `${base}/api/connectors/${connectorSlug}/client-metadata`;
}

export function redirectUriFor(connectorSlug: string): string {
	return `${env.NEXT_PUBLIC_API_URL}/api/connectors/callback/${connectorSlug}`;
}

function pickAuthMethod(
	supported: string[] | undefined,
	issuer: string,
): "client_secret_post" | "client_secret_basic" | "none" {
	const methods = supported ?? ["client_secret_basic"];
	if (methods.includes("client_secret_post")) return "client_secret_post";
	if (methods.includes("client_secret_basic")) return "client_secret_basic";
	// Registering as `none` against a server that never offered it yields a
	// public client whose token requests it will reject, far from here.
	if (!methods.includes("none")) {
		throw new Error(
			`${issuer} supports none of the client authentication methods Paradev can use (it advertises ${methods.join(", ")}).`,
		);
	}
	return "none";
}

/** Only ask for what the server grants; requesting refresh_token blindly can fail registration. */
function pickGrantTypes(supported: string[] | undefined): string[] {
	if (!supported) return ["authorization_code", "refresh_token"];
	return ["authorization_code", "refresh_token"].filter((grant) =>
		supported.includes(grant),
	);
}

function authenticationFor(
	method: string | null | undefined,
): "basic" | "post" | undefined {
	if (method === "client_secret_post") return "post";
	if (method === "client_secret_basic") return "basic";
	return undefined;
}

type StoredClientRow = typeof pluginOauthClients.$inferSelect;

function unexpired(row: StoredClientRow): boolean {
	return !row.clientSecretExpiresAt || row.clientSecretExpiresAt > new Date();
}

async function storedClient(
	issuer: string,
	redirectUri: string,
	pick: { clientId: string } | { coveringScopes: string[] } | { oldest: true },
): Promise<ClientIdentity | null> {
	const rows = await db
		.select()
		.from(pluginOauthClients)
		.where(
			and(
				eq(pluginOauthClients.issuer, issuer),
				eq(pluginOauthClients.redirectUri, redirectUri),
			),
		)
		.orderBy(asc(pluginOauthClients.createdAt));

	const row =
		"clientId" in pick
			? rows.find((candidate) => candidate.clientId === pick.clientId)
			: "oldest" in pick
				? rows.find(unexpired)
				: // A row from before scopes were recorded covers none, so a connector
					// asking for any scope registers afresh rather than reuse a client
					// the server may reject them for.
					rows.find(
						(candidate) =>
							unexpired(candidate) &&
							pick.coveringScopes.every((scope) =>
								candidate.scopes?.includes(scope),
							),
					);
	if (!row) return null;
	return identity(
		row.clientId,
		await decryptOptional(row.clientSecret),
		row.tokenEndpointAuthMethod,
	);
}

function identity(
	clientId: string,
	secret: string | null | undefined,
	tokenEndpointAuthMethod: string | null,
): ClientIdentity {
	const authentication = authenticationFor(tokenEndpointAuthMethod);
	return {
		clientId,
		...(secret ? { clientSecret: secret } : {}),
		...(authentication ? { authentication } : {}),
	};
}

async function register(
	connectorSlug: string,
	server: DiscoveredServer,
	method: ConnectorMethod,
	redirectUri: string,
): Promise<ClientIdentity> {
	const endpoint = server.metadata.registration_endpoint;
	if (!endpoint) {
		throw new Error(
			`${server.issuer} supports neither a client id metadata document nor dynamic client registration, so the "${connectorSlug}" connector cannot obtain a client. Give it a static authorization_url, token_url, and requires_env instead.`,
		);
	}

	const tokenEndpointAuthMethod = pickAuthMethod(
		server.metadata.token_endpoint_auth_methods_supported,
		server.issuer,
	);
	const response = await credentialFetch(
		endpoint,
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json",
			},
			body: JSON.stringify({
				client_name: "Paradev",
				client_uri: CANONICAL_URLS.MARKETING,
				redirect_uris: [redirectUri],
				grant_types: pickGrantTypes(server.metadata.grant_types_supported),
				response_types: ["code"],
				application_type: "web",
				token_endpoint_auth_method: tokenEndpointAuthMethod,
				...(method.scopes?.length
					? { scope: method.scopes.join(method.scope_separator ?? " ") }
					: {}),
			}),
		},
		"client registration",
	);

	if (!response.ok) {
		throw new Error(
			`Dynamic client registration with ${server.issuer} failed: ${response.status} ${await response.text()}`,
		);
	}

	const payload = (await response.json()) as {
		client_id?: string;
		client_secret?: string;
		client_secret_expires_at?: number;
		registration_access_token?: string;
		registration_client_uri?: string;
		token_endpoint_auth_method?: string;
	};
	if (!payload.client_id) {
		throw new Error(
			`${server.issuer} returned no client_id from dynamic client registration.`,
		);
	}

	const resolvedAuthMethod = payload.client_secret
		? (payload.token_endpoint_auth_method ?? tokenEndpointAuthMethod)
		: "none";
	const expiresAt =
		payload.client_secret_expires_at && payload.client_secret_expires_at > 0
			? new Date(payload.client_secret_expires_at * 1000)
			: null;

	const row = {
		clientId: payload.client_id,
		clientSecret: await encryptOptional(payload.client_secret),
		clientSecretExpiresAt: expiresAt,
		registrationAccessToken: await encryptOptional(
			payload.registration_access_token,
		),
		registrationClientUri: payload.registration_client_uri ?? null,
		tokenEndpointAuthMethod: resolvedAuthMethod,
		// What was asked for, not what the response echoes: a server that grants
		// less would otherwise send every connect into another registration.
		scopes: method.scopes ?? [],
	};

	await db
		.insert(pluginOauthClients)
		.values({ issuer: server.issuer, redirectUri, ...row })
		.onConflictDoUpdate({
			target: [
				pluginOauthClients.issuer,
				pluginOauthClients.redirectUri,
				pluginOauthClients.clientId,
			],
			set: row,
		});

	return identity(payload.client_id, payload.client_secret, resolvedAuthMethod);
}

const registering = new Map<string, Promise<ClientIdentity>>();

export async function resolveClientIdentity(
	connectorSlug: string,
	server: DiscoveredServer,
	method: ConnectorMethod,
	redirectUri: string,
	client: ClientFor,
): Promise<ClientIdentity> {
	const metadataUrl = clientMetadataUrl(connectorSlug);
	const issuedTo = "issuedTo" in client ? client.issuedTo : null;
	if (issuedTo === metadataUrl) return { clientId: metadataUrl };
	if (issuedTo) {
		const bound = await storedClient(server.issuer, redirectUri, {
			clientId: issuedTo,
		});
		if (!bound) throw new ForgottenClientError(server.issuer, issuedTo);
		return bound;
	}

	if (
		server.metadata.client_id_metadata_document_supported &&
		new URL(metadataUrl).protocol === "https:"
	) {
		return { clientId: metadataUrl };
	}

	const scopes = method.scopes ?? [];
	const existing = await storedClient(
		server.issuer,
		redirectUri,
		"newGrant" in client ? { coveringScopes: scopes } : { oldest: true },
	);
	if (existing) return existing;

	const key = `${server.issuer}\n${redirectUri}\n${scopes.join(" ")}`;
	const pending = registering.get(key);
	if (pending) return await pending;

	const attempt = register(connectorSlug, server, method, redirectUri).finally(
		() => registering.delete(key),
	);
	registering.set(key, attempt);
	return await attempt;
}

export async function forgetClient(
	issuer: string,
	redirectUri: string,
	clientId: string,
): Promise<void> {
	await db
		.delete(pluginOauthClients)
		.where(
			and(
				eq(pluginOauthClients.issuer, issuer),
				eq(pluginOauthClients.redirectUri, redirectUri),
				eq(pluginOauthClients.clientId, clientId),
			),
		);
}
