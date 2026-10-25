import { CLIError, number, string } from "@superset/cli-framework";
import { z } from "zod";
import { command } from "../../../lib/command";
import {
	resolveSessionWorkspace,
	type SessionDurableEnvelope,
	type SessionPageResult,
	sessionWorkspaceOptions,
} from "../../../lib/sessions";

const beforeCursorSchema = z.object({
	epoch: z.string().min(1),
	seq: z.number().int().nonnegative(),
});

function parseBeforeCursor(
	value: string | undefined,
): z.infer<typeof beforeCursorSchema> | undefined {
	if (value === undefined) return undefined;
	let json: unknown;
	try {
		json = JSON.parse(value);
	} catch {
		json = undefined;
	}
	const parsed = beforeCursorSchema.safeParse(json);
	if (!parsed.success)
		throw new CLIError(
			"Invalid --before cursor",
			'Pass the nextBefore value from a previous read as JSON, e.g. --before \'{"epoch":"EPOCH","seq":42}\'',
		);
	return parsed.data;
}

function formatEnvelope(envelope: SessionDurableEnvelope): string | null {
	const event = envelope.event;
	if (event.type === "session") {
		const session = event.session as
			| { status?: string; harness?: string }
			| undefined;
		return `[session] ${session?.harness ?? "agent"}: ${session?.status ?? "unknown"}`;
	}
	if (event.type === "turn") {
		const turn = event.turn as { id?: string; status?: string } | undefined;
		return `[turn ${turn?.id ?? ""}] ${turn?.status ?? "unknown"}`.trim();
	}
	if (event.type === "item") {
		const item = event.item as
			| {
					kind?: string;
					text?: string;
					title?: string;
					toolName?: string;
					status?: string;
					content?: Array<{ type?: string; text?: string; name?: string }>;
			  }
			| undefined;
		if (!item) return null;
		if (item.kind === "user_message") {
			const parts = (item.content ?? [])
				.map((part) =>
					part.type === "text"
						? part.text
						: part.name
							? `[attachment: ${part.name}]`
							: "",
				)
				.filter(Boolean);
			return `[user] ${parts.join(" ")}`.trim();
		}
		if (item.kind === "agent_message") {
			return `[agent] ${item.text ?? ""}`.trim();
		}
		if (item.kind === "tool_call") {
			return `[tool:${item.toolName ?? "call"}] ${item.title ?? ""} (${item.status ?? "running"})`.trim();
		}
		if (item.kind === "reasoning" && item.text) {
			return `[reasoning] ${item.text}`;
		}
		return `[item:${item.kind ?? "unknown"}]`;
	}
	return null;
}

function formatReadMessage(sessionId: string, page: SessionPageResult): string {
	if (!page.ok) {
		return `Session ${sessionId} reset: ${page.reset}`;
	}
	if (page.envelopes.length === 0) {
		return `No events in session ${sessionId}`;
	}
	const lines = page.envelopes
		.map(formatEnvelope)
		.filter((line): line is string => Boolean(line));
	const body =
		lines.length > 0
			? lines.join("\n")
			: `${page.envelopes.length} event(s) in session ${sessionId}`;
	return page.nextBefore
		? `${body}\n\nOlder events: --before '${JSON.stringify(page.nextBefore)}'`
		: body;
}

export default command({
	description: "Read structured events from a chat session",
	options: {
		...sessionWorkspaceOptions,
		session: string().required().desc("Chat session ID to read"),
		limit: number()
			.int()
			.min(1)
			.max(500)
			.desc("Maximum number of journal events to return (1-500)"),
		before: string().desc(
			"Return events older than this cursor: the JSON nextBefore value from a previous read",
		),
	},
	run: async ({ ctx, options }) => {
		const before = parseBeforeCursor(options.before ?? undefined);
		const { sessions } = await resolveSessionWorkspace(ctx, options);

		const result = await sessions.read.query({
			workspaceId: options.workspace,
			sessionId: options.session,
			limit: options.limit,
			...(before ? { before } : {}),
		});

		return {
			data: result,
			message: formatReadMessage(options.session, result),
		};
	},
});
