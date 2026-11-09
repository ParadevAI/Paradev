import {
	existsSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { CONTINUE_PROMPT } from "@superset/chat/core";
import { userContentSchema } from "@superset/chat/protocol";
import type { ChatRuntime } from "@superset/chat-runtime";
import { z } from "zod";

export const RESUME_MARKER_MAX_AGE_MS = 30 * 60_000;

export const CONTINUE_AFTER_UPDATE_PROMPT = `Paradev restarted to install an update, which stopped your work before it finished, including any commands running in the background. ${CONTINUE_PROMPT}`;

const sessionSchema = z.object({
	scopeId: z.string().min(1),
	harness: z.string().min(1),
	harnessSessionId: z.string().min(1),
	terminalId: z.string().min(1).optional(),
	modeId: z.string().optional(),
	modelId: z.string().optional(),
	effortId: z.string().optional(),
	interrupted: z.boolean(),
	prompts: z.array(z.array(userContentSchema).min(1)),
	pausedPrompts: z.array(z.array(userContentSchema).min(1)).default([]),
});

const markerSchema = z.object({
	requestedAt: z.number(),
	sessions: z.array(z.unknown()).optional(),
});

export function recordUnfinishedChats(
	runtime: ChatRuntime,
	markerPath: string,
): boolean {
	if (!existsSync(markerPath)) return false;
	const marker = markerSchema.safeParse(readMarker(markerPath));
	const pending = `${markerPath}.${process.pid}.tmp`;
	writeFileSync(
		pending,
		JSON.stringify({
			requestedAt: marker.success ? marker.data.requestedAt : Date.now(),
			sessions: runtime.live.unfinished(),
		}),
	);
	renameSync(pending, markerPath);
	return true;
}

/**
 * Resumes the chats an update restart stopped. Ones it cannot resume here (the
 * marker is too old, or the resume failed) come back to be offered instead.
 */
export function resumeUnfinishedChats(options: {
	markerPath: string;
	runtime: () => ChatRuntime;
	resolveCwd: (scopeId: string) => string;
	/** False for a chat whose agent config can no longer carry it: it is offered, not continued on another account. */
	keepsAccount?: (sessionId: string) => boolean;
	now?: number;
}): { resumed: number; offer: ClosedChat[] } {
	const none = { resumed: 0, offer: [] };
	if (!existsSync(options.markerPath)) return none;
	const marker = markerSchema.safeParse(readMarker(options.markerPath));
	try {
		unlinkSync(options.markerPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			console.warn("[chat-v3] could not remove the resume marker", error);
			return none;
		}
	}
	if (!marker.success || !marker.data.sessions?.length) return none;
	const sessions = marker.data.sessions.flatMap((entry) => {
		const parsed = closedChatSchema.safeParse(entry);
		return parsed.success ? [parsed.data] : [];
	});
	const age = (options.now ?? Date.now()) - marker.data.requestedAt;
	if (age > RESUME_MARKER_MAX_AGE_MS) return { resumed: 0, offer: sessions };

	const runtime = options.runtime();
	const offer: ClosedChat[] = [];
	let resumed = 0;
	for (const chat of sessions) {
		const { sessionId: _sessionId, interrupted, prompts, ...session } = chat;
		if (!runtime.live.supports(session.harness)) continue;
		if (options.keepsAccount && !options.keepsAccount(chat.sessionId)) {
			offer.push(chat);
			continue;
		}
		try {
			runtime.commands.resumeSession({
				...session,
				sourceSessionId: chat.sessionId,
				cwd: options.resolveCwd(session.scopeId),
				prompts: [
					...(interrupted
						? [[{ type: "text" as const, text: CONTINUE_AFTER_UPDATE_PROMPT }]]
						: []),
					...prompts,
				],
			});
			resumed++;
		} catch (error) {
			console.warn("[chat-v3] could not resume a chat after the update", error);
			offer.push(chat);
		}
	}
	return { resumed, offer };
}

const closedChatSchema = sessionSchema
	.pick({
		scopeId: true,
		harness: true,
		harnessSessionId: true,
		terminalId: true,
		modeId: true,
		modelId: true,
		pausedPrompts: true,
	})
	.extend({
		sessionId: z.string().min(1),
		interrupted: z.boolean().default(true),
		prompts: z.array(z.array(userContentSchema).min(1)).default([]),
	});

export type ClosedChat = z.infer<typeof closedChatSchema>;

/** Every chat with work left: a turn or background task running, or prompts queued. */
export function closedChatsOf(runtime: ChatRuntime): ClosedChat[] {
	return runtime.live.unfinished().map((session) => ({
		sessionId: session.sessionId,
		scopeId: session.scopeId,
		harness: session.harness,
		harnessSessionId: session.harnessSessionId,
		terminalId: session.terminalId,
		modeId: session.modeId,
		modelId: session.modelId,
		interrupted: session.interrupted,
		prompts: session.prompts,
		pausedPrompts: session.pausedPrompts,
	}));
}

/** Writes the chats the next launch offers to resume, or removes the file when there are none. */
export function writeClosedChats(path: string, chats: ClosedChat[]): void {
	if (chats.length === 0) {
		try {
			unlinkSync(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		return;
	}
	const pending = `${path}.${process.pid}.tmp`;
	writeFileSync(pending, JSON.stringify({ sessions: chats }));
	renameSync(pending, path);
}

export function restoreClosedChats(path: string): ClosedChat[] {
	if (!existsSync(path)) return [];
	const parsed = z
		.object({ sessions: z.array(z.unknown()) })
		.safeParse(readMarker(path));
	if (!parsed.success) return [];
	return parsed.data.sessions.flatMap((entry) => {
		const chat = closedChatSchema.safeParse(entry);
		return chat.success ? [chat.data] : [];
	});
}

function readMarker(markerPath: string): unknown {
	try {
		return JSON.parse(readFileSync(markerPath, "utf8"));
	} catch {
		return null;
	}
}
