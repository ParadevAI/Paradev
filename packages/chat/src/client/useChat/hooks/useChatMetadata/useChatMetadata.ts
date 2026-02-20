import { useCallback, useMemo } from "react";
import type { AgentValue, ChunkRow, RawPresenceRow } from "../../../../schema";
import type { SessionDB } from "../../../../session-db/session-db";
import { useCollectionData } from "../useCollectionData";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatUserPresence {
	userId: string;
	deviceId: string;
	name?: string;
	status: "active" | "idle" | "typing" | "offline";
	lastSeenAt: string;
	draft?: string;
	cursorPosition?: number;
}

export interface ChatAgentPresence {
	agentId: string;
	name?: string;
	endpoint: string;
	triggers?: "all" | "user-messages";
	model?: string;
	generationMessageId?: string;
}

export interface UseChatMetadataOptions {
	sessionDB: SessionDB | null;
	proxyUrl: string;
	sessionId: string | null;
	getHeaders?: () => Record<string, string>;
}

export interface UseChatMetadataReturn {
	/** Current session title (derived from stream config events). */
	title: string | null;
	/** Online users in this session. */
	users: ChatUserPresence[];
	/** Registered agents in this session. */
	agents: ChatAgentPresence[];
	/** Update user presence status. */
	updateStatus: (
		userId: string,
		deviceId: string,
		status: ChatUserPresence["status"],
	) => void;
	/** Update user draft text. */
	updateDraft: (
		userId: string,
		deviceId: string,
		text: string,
		cursorPosition?: number,
	) => void;
	/** Users currently typing with draft content. */
	drafts: Array<{ userId: string; name?: string; text: string }>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatMetadata(
	options: UseChatMetadataOptions,
): UseChatMetadataReturn {
	const { sessionDB, proxyUrl, sessionId, getHeaders } = options;

	const authHeaders = getHeaders ?? (() => ({}));

	// -----------------------------------------------------------------------
	// Title — derived from config-type chunks (title chunks remain)
	// -----------------------------------------------------------------------

	const chunks = useCollectionData(
		sessionDB?.collections.chunks ?? null,
	) as ChunkRow[];

	const title = useMemo(() => {
		let title: string | null = null;

		for (const row of chunks) {
			try {
				const parsed = JSON.parse(row.chunk);
				if (parsed.type === "config" && typeof parsed.title === "string") {
					title = parsed.title;
				}
			} catch {
				// skip unparseable
			}
		}

		return title;
	}, [chunks]);

	// -----------------------------------------------------------------------
	// Presence — users from presence collection
	// -----------------------------------------------------------------------

	const presenceRows = useCollectionData(
		sessionDB?.collections.presence ?? null,
	) as RawPresenceRow[];

	const users = useMemo(
		(): ChatUserPresence[] =>
			presenceRows
				.filter((r) => r.status !== "offline")
				.map((r) => ({
					userId: r.userId,
					deviceId: r.deviceId,
					name: r.name,
					status: r.status,
					lastSeenAt: r.lastSeenAt,
					draft: r.draft,
					cursorPosition: r.cursorPosition,
				})),
		[presenceRows],
	);

	// -----------------------------------------------------------------------
	// Agents — from agents collection
	// -----------------------------------------------------------------------

	const agentRows = useCollectionData(
		sessionDB?.collections.agents ?? null,
	) as AgentValue[];

	const agents = useMemo(
		(): ChatAgentPresence[] =>
			agentRows.map((r) => ({
				agentId: r.agentId,
				name: r.name,
				endpoint: r.endpoint,
				triggers: r.triggers,
				model: r.model,
				generationMessageId: r.generationMessageId,
			})),
		[agentRows],
	);

	// -----------------------------------------------------------------------
	// Presence mutations
	// -----------------------------------------------------------------------

	const basePresenceUrl = `${proxyUrl}/api/chat/${sessionId}/stream`;

	const updateStatus = useCallback(
		(userId: string, deviceId: string, status: ChatUserPresence["status"]) => {
			if (!sessionId) return;
			const endpoint = status === "offline" ? "logout" : "login";
			fetch(`${basePresenceUrl}/${endpoint}`, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...authHeaders() },
				body: JSON.stringify({ userId, deviceId, status }),
			}).catch(console.error);
		},
		[basePresenceUrl, authHeaders, sessionId],
	);

	const updateDraft = useCallback(
		(
			userId: string,
			deviceId: string,
			text: string,
			cursorPosition?: number,
		) => {
			if (!sessionId) return;
			fetch(`${basePresenceUrl}/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...authHeaders() },
				body: JSON.stringify({
					userId,
					deviceId,
					status: "typing",
					draft: text,
					cursorPosition,
				}),
			}).catch(console.error);
		},
		[basePresenceUrl, authHeaders, sessionId],
	);

	const drafts = useMemo(
		() =>
			users
				.filter((u) => u.draft && u.draft.length > 0)
				.map((u) => ({
					userId: u.userId,
					name: u.name,
					text: u.draft as string,
				})),
		[users],
	);

	return {
		title,
		users,
		agents,
		updateStatus,
		updateDraft,
		drafts,
	};
}
