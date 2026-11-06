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

export function resumeUnfinishedChats(options: {
	markerPath: string;
	runtime: () => ChatRuntime;
	resolveCwd: (scopeId: string) => string;
	now?: number;
}): void {
	if (!existsSync(options.markerPath)) return;
	const marker = markerSchema.safeParse(readMarker(options.markerPath));
	try {
		unlinkSync(options.markerPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			console.warn("[chat-v3] could not remove the resume marker", error);
			return;
		}
	}
	if (!marker.success || !marker.data.sessions?.length) return;
	const age = (options.now ?? Date.now()) - marker.data.requestedAt;
	if (age > RESUME_MARKER_MAX_AGE_MS) return;

	const runtime = options.runtime();
	for (const entry of marker.data.sessions) {
		const parsed = sessionSchema.safeParse(entry);
		if (!parsed.success) continue;
		const { interrupted, prompts, ...session } = parsed.data;
		if (!runtime.live.supports(session.harness)) continue;
		try {
			runtime.commands.resumeSession({
				...session,
				cwd: options.resolveCwd(session.scopeId),
				prompts: [
					...(interrupted
						? [[{ type: "text" as const, text: CONTINUE_AFTER_UPDATE_PROMPT }]]
						: []),
					...prompts,
				],
			});
		} catch (error) {
			console.warn("[chat-v3] could not resume a chat after the update", error);
		}
	}
}

const closedChatSchema = sessionSchema
	.pick({
		scopeId: true,
		harness: true,
		harnessSessionId: true,
		terminalId: true,
		modeId: true,
		modelId: true,
	})
	.extend({ sessionId: z.string().min(1) });

/** Notes the chats a quit cut off mid-turn, for the sidebar after the next boot. */
export function recordClosedChats(runtime: ChatRuntime, path: string): void {
	const sessions = runtime.live
		.unfinished()
		.filter((session) => session.interrupted)
		.map(
			({
				sessionId,
				scopeId,
				harness,
				harnessSessionId,
				terminalId,
				modeId,
				modelId,
			}) => ({
				sessionId,
				scopeId,
				harness,
				harnessSessionId,
				terminalId,
				modeId,
				modelId,
			}),
		);
	if (sessions.length === 0) return;
	const pending = `${path}.${process.pid}.tmp`;
	writeFileSync(pending, JSON.stringify({ sessions }));
	renameSync(pending, path);
}

export function restoreClosedChats(
	path: string,
	closedMidTurn: (chat: z.infer<typeof closedChatSchema>) => void,
): void {
	if (!existsSync(path)) return;
	const marker = readMarker(path);
	try {
		unlinkSync(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
	}
	const parsed = z.object({ sessions: z.array(z.unknown()) }).safeParse(marker);
	if (!parsed.success) return;
	for (const entry of parsed.data.sessions) {
		const chat = closedChatSchema.safeParse(entry);
		if (chat.success) closedMidTurn(chat.data);
	}
}

function readMarker(markerPath: string): unknown {
	try {
		return JSON.parse(readFileSync(markerPath, "utf8"));
	} catch {
		return null;
	}
}
