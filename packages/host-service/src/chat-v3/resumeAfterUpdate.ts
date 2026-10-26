import {
	existsSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { userContentSchema } from "@superset/chat/protocol";
import type { ChatRuntime } from "@superset/chat-runtime";
import { z } from "zod";

export const RESUME_MARKER_MAX_AGE_MS = 30 * 60_000;

export const CONTINUE_AFTER_UPDATE_PROMPT =
	"Paradev restarted to install an update, which stopped your work before it finished, including any commands running in the background. Continue where you left off.";

const sessionSchema = z.object({
	sessionId: z.string().min(1).optional(),
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
	const age = marker.success
		? (options.now ?? Date.now()) - marker.data.requestedAt
		: Number.POSITIVE_INFINITY;
	if (
		!marker.success ||
		!marker.data.sessions?.length ||
		age > RESUME_MARKER_MAX_AGE_MS
	) {
		removeMarker(options.markerPath);
		return;
	}

	const runtime = options.runtime();
	const retained: unknown[] = [];
	const resumable: Array<z.infer<typeof sessionSchema>> = [];
	const savedSessions = runtime.sessions.list();
	for (const entry of marker.data.sessions) {
		const parsed = sessionSchema.safeParse(entry);
		if (!parsed.success) continue;
		const { sessionId, interrupted, prompts, ...session } = parsed.data;
		const saved = sessionId ? runtime.sessions.get(sessionId) : undefined;
		const accountBound =
			saved?.launchContextJson != null ||
			savedSessions.some(
				(row) =>
					row.launchContextJson !== null &&
					row.scopeId === session.scopeId &&
					row.harness === session.harness &&
					row.harnessSessionId === session.harnessSessionId,
			);
		if (accountBound) {
			retained.push(entry);
			continue;
		}
		resumable.push(parsed.data);
	}
	try {
		if (retained.length) {
			const pending = `${options.markerPath}.${process.pid}.tmp`;
			try {
				writeFileSync(
					pending,
					JSON.stringify({ ...marker.data, sessions: retained }),
					{ mode: 0o600 },
				);
				renameSync(pending, options.markerPath);
			} finally {
				if (existsSync(pending)) unlinkSync(pending);
			}
		} else if (!removeMarker(options.markerPath)) return;
	} catch (error) {
		console.warn(
			"[chat-v3] could not preserve the account resume marker",
			error,
		);
		return;
	}
	for (const {
		sessionId: _storedSessionId,
		interrupted,
		prompts,
		...session
	} of resumable) {
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

function removeMarker(path: string): boolean {
	try {
		unlinkSync(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
		console.warn("[chat-v3] could not remove the resume marker", error);
		return false;
	}
}

function readMarker(markerPath: string): unknown {
	try {
		return JSON.parse(readFileSync(markerPath, "utf8"));
	} catch {
		return null;
	}
}
