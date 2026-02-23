import { ELECTRIC_PROTOCOL_QUERY_PARAMS } from "@electric-sql/client";
import { auth } from "@superset/auth/server";
import { env } from "@/env";
import { buildWhereClause } from "./utils";

export async function GET(request: Request): Promise<Response> {
	const sessionData = await auth.api.getSession({
		headers: request.headers,
	});
	if (!sessionData?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const url = new URL(request.url);

	// Use client-sent organizationId, falling back to session for older clients.
	// TODO(2026-02-26): Remove activeOrganizationId fallback once all clients send organizationId param.
	const organizationId =
		url.searchParams.get("organizationId") ??
		sessionData.session.activeOrganizationId;
	const allowedOrgIds = sessionData.session.organizationIds ?? [];

	if (organizationId && !allowedOrgIds.includes(organizationId)) {
		return new Response("Not a member of this organization", { status: 403 });
	}

	const {
		ELECTRIC_SOURCE_ID,
		ELECTRIC_SOURCE_SECRET,
		ELECTRIC_URL,
		ELECTRIC_SECRET,
	} = env;

	let originUrl: URL;
	if (ELECTRIC_SOURCE_ID && ELECTRIC_SOURCE_SECRET) {
		originUrl = new URL("/v1/shape", "https://api.electric-sql.cloud");
		originUrl.searchParams.set("source_id", ELECTRIC_SOURCE_ID);
		originUrl.searchParams.set("source_secret", ELECTRIC_SOURCE_SECRET);
	} else if (ELECTRIC_URL && ELECTRIC_SECRET) {
		originUrl = new URL(ELECTRIC_URL);
		originUrl.searchParams.set("secret", ELECTRIC_SECRET);
	} else {
		return new Response(
			"Missing Electric config: set ELECTRIC_SOURCE_ID/SECRET or ELECTRIC_URL/SECRET",
			{ status: 500 },
		);
	}

	url.searchParams.forEach((value, key) => {
		if (ELECTRIC_PROTOCOL_QUERY_PARAMS.includes(key)) {
			originUrl.searchParams.set(key, value);
		}
	});

	const tableName = url.searchParams.get("table");
	if (!tableName) {
		return new Response("Missing table parameter", { status: 400 });
	}

	const whereClause = await buildWhereClause(
		tableName,
		organizationId ?? "",
		sessionData.user.id,
	);
	if (!whereClause) {
		return new Response(`Unknown table: ${tableName}`, { status: 400 });
	}

	originUrl.searchParams.set("table", tableName);
	originUrl.searchParams.set("where", whereClause.fragment);
	whereClause.params.forEach((value, index) => {
		originUrl.searchParams.set(`params[${index + 1}]`, String(value));
	});

	if (tableName === "auth.apikeys") {
		originUrl.searchParams.set(
			"columns",
			"id,name,start,created_at,last_request",
		);
	}

	if (tableName === "integration_connections") {
		originUrl.searchParams.set(
			"columns",
			"id,organization_id,connected_by_user_id,provider,token_expires_at,external_org_id,external_org_name,config,created_at,updated_at",
		);
	}

	const response = await fetch(originUrl.toString());

	const headers = new Headers(response.headers);
	headers.append("Vary", "Authorization");

	if (headers.get("content-encoding")) {
		headers.delete("content-encoding");
		headers.delete("content-length");
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
