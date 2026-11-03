import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { McpServer } from "@modelcontextprotocol/server";
import { mintUserJwt } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { members, users } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import type { McpCallerKind, PersonMcpContext } from "./auth";
import type { McpToolCallEmitter } from "./define-tool";
import { createMcpServer } from "./server";

export interface InMemoryClientOptions {
	userId: string;
	organizationId: string;
	clientLabel: string;
	relayUrl: string;
	realtimeUrl: string;
	onToolCall?: McpToolCallEmitter;
}

/**
 * Build an in-memory MCP client/server pair for server-side agent integrations
 * (the Slack agent, the automations dispatcher, etc.), acting as `userId`.
 *
 * Callers MUST await the returned `cleanup()` to free the in-memory transport.
 * Use it inside a `try/finally` or with `await using` if your runtime supports it.
 */
export async function createInMemoryMcpClient({
	userId,
	organizationId,
	clientLabel,
	relayUrl,
	realtimeUrl,
	onToolCall,
}: InMemoryClientOptions): Promise<{
	client: Client;
	cleanup: () => Promise<void>;
}> {
	const [user] = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user) {
		throw new Error(`User ${userId} not found`);
	}
	const memberships = await db
		.select({ organizationId: members.organizationId })
		.from(members)
		.where(eq(members.userId, userId));
	const organizationIds = [
		...new Set(memberships.map((m) => m.organizationId)),
	];
	if (!organizationIds.includes(organizationId)) {
		throw new Error(
			`User ${userId} is not a member of organization ${organizationId}`,
		);
	}

	// Same scoping as resolveMcpContext: the relay trusts this claim, so the
	// host-call token must carry only the org this client is bound to.
	const bearerToken = await mintUserJwt({
		userId,
		organizationIds: [organizationId],
		ttlSeconds: 300,
	});

	const context: PersonMcpContext = {
		kind: "person",
		userId,
		email: user.email,
		organizationId,
		organizationIds,
		source: "api-key",
		clientLabel,
		requestId: crypto.randomUUID(),
		bearerToken,
		relayUrl,
		realtimeUrl,
	};

	return connect(createMcpServer({ kind: "person", context, onToolCall }));
}

/** What a caller of this kind sees in `tools/list`, for listings like the server card. */
export async function listTools(kind: McpCallerKind) {
	const { client, cleanup } = await connect(
		createMcpServer({ kind, context: null }),
	);
	try {
		return (await client.listTools()).tools;
	} finally {
		await cleanup();
	}
}

async function connect(server: McpServer): Promise<{
	client: Client;
	cleanup: () => Promise<void>;
}> {
	const [serverTransport, clientTransport] =
		InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);

	const client = new Client({
		name: "superset-internal",
		version: "1.0.0",
	});
	await client.connect(clientTransport);

	return {
		client,
		cleanup: async () => {
			await client.close();
			await server.close();
		},
	};
}
