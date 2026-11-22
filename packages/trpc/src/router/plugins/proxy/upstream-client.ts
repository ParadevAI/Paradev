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
	/** Ends the vendor session; `client.close()` alone leaves it open. */
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
	if (stored) {
		const session = await upstreamClient(target, stored);
		try {
			return await call(session);
		} catch (error) {
			// The vendor answers 404 for a session it has expired, before it runs
			// the call, so a fresh session can run it.
			if (!(error instanceof StreamableHTTPError && error.code === 404))
				throw error;
		} finally {
			await session.client.close();
		}
	}

	const session = await upstreamClient(target);
	const keep = sessions ? session.resumable() : null;
	if (sessions && keep) await sessions.set(target.connectionId, keep);
	try {
		return await call(session);
	} finally {
		await (keep ? session.client.close() : session.close());
	}
}
