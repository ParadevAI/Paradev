import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
	StreamableHTTPClientTransport,
	StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
	CallToolRequest,
	CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { credentialFetch } from "../manifest";
import type { ResumableSession, UpstreamSessions } from "./upstream-sessions";

const UPSTREAM_TIMEOUT_MS = 120_000;

export interface UpstreamTarget {
	url: string;
	headers: Record<string, string>;
	/** Set for a URL an untrusted manifest chose; the connection may only reach public addresses. */
	publicOnly?: boolean;
}

export interface UpstreamSession {
	client: Client;
	/** Null when the vendor keeps no session. */
	resumable(): ResumableSession | null;
	close(): Promise<void>;
}

export async function upstreamClient(
	target: UpstreamTarget,
	resume?: ResumableSession,
): Promise<UpstreamSession> {
	const client = new Client({ name: "superset", version: "1.0.0" });
	const transport = new StreamableHTTPClientTransport(new URL(target.url), {
		requestInit: { headers: target.headers },
		sessionId: resume?.sessionId,
		fetch: (url, init) =>
			credentialFetch(String(url), init ?? {}, "mcp", UPSTREAM_TIMEOUT_MS, {
				publicOnly: target.publicOnly,
			}),
	});
	await client.connect(transport);
	if (resume) transport.setProtocolVersion(resume.protocolVersion);

	return {
		client,
		resumable() {
			const { sessionId, protocolVersion } = transport;
			return sessionId && protocolVersion
				? { sessionId, protocolVersion }
				: null;
		},
		async close() {
			// close() only aborts our end, so the vendor holds the session open
			// until it expires on its own. The DELETE is what releases it, and a
			// server that refuses one is not a reason to fail the call that just
			// succeeded.
			try {
				await transport.terminateSession();
			} catch {}
			await client.close();
		},
	};
}

// What a vendor answers for a session it has dropped, before it runs the call.
const SESSION_GONE = new Set([400, 401, 404]);

export async function callUpstream(
	target: UpstreamTarget & { connectionId: string },
	params: CallToolRequest["params"],
	signal: AbortSignal,
	sessions?: UpstreamSessions,
): Promise<CallToolResult> {
	const call = async (session: UpstreamSession) =>
		(await session.client.callTool(params, undefined, {
			signal,
		})) as CallToolResult;

	const stored = await sessions?.get(target.connectionId);
	if (sessions && stored) {
		const session = await upstreamClient(target, stored);
		try {
			const result = await call(session);
			await sessions.touch();
			return result;
		} catch (error) {
			if (
				!(
					error instanceof StreamableHTTPError &&
					SESSION_GONE.has(error.code ?? 0)
				)
			)
				throw error;
			await sessions.drop(target.connectionId);
		} finally {
			await session.client.close();
		}
	}

	const session = await upstreamClient(target);
	const resumable = session.resumable();
	const kept =
		sessions && resumable
			? await sessions.claim(target.connectionId, resumable)
			: false;
	try {
		return await call(session);
	} finally {
		await (kept ? session.client.close() : session.close());
	}
}
