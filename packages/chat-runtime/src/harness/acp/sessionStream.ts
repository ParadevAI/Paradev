import type {
	Item,
	ItemAttachment,
	ToolCall,
	ToolContent,
} from "@superset/chat/protocol";
import { withoutImageData } from "./imageBlocks";
import {
	mapToolBody,
	mcpServerOf,
	messageText,
	planEntryItems,
	toolCallSettled,
	toolKind,
	toolStatus,
} from "./itemMapping";
import {
	type AcpContentBlock,
	type AcpToolCallContent,
	acpContentBlockSchema,
	acpMessageSchema,
	acpPlanSchema,
	acpPlanUpdateSchema,
	acpToolCallContentChunkSchema,
	acpToolCallUpdateSchema,
} from "./wire";

export function messageIdOf(raw: unknown): string | null {
	const messageId = (raw as { messageId?: unknown }).messageId;
	return typeof messageId === "string" && messageId !== "" ? messageId : null;
}

export type TextKind = "agent_message" | "reasoning" | "user_message";

type OpenText = {
	itemId: string;
	kind: TextKind;
	messageId: string | null;
	text: string;
	attachments: ItemAttachment[];
	turnId: string;
	startedAtMs: number;
	model?: string;
	from?: "parent";
};

export type SessionStreamOptions = {
	idPrefix: string;
	scopeIdsByTurn: boolean;
	parentItemId?: string;
	streamUserMessages: boolean;
	emitItem: (item: Item, turnId: string) => void;
	emitTextDelta: (itemId: string, append: string) => void;
	attachmentOf: (
		block: AcpContentBlock | undefined,
		referenceId?: string,
	) => ItemAttachment | null;
	reportedModel?: (raw: unknown) => string | undefined;
	defaultModel?: () => string | undefined;
	onNotify?: (level: string, text: string) => void;
	nextStartMs: () => number;
	now: () => number;
	mintId: () => string;
};

export class SessionStream {
	private open: OpenText | null = null;
	private readonly messages = new Map<
		string,
		{
			text: string;
			attachments: ItemAttachment[];
			startedAtMs: number;
			model?: string;
			from?: "parent";
		}
	>();
	private readonly toolCalls = new Map<string, ToolCall>();
	private readonly planItems = new Map<string, number>();

	constructor(private readonly options: SessionStreamOptions) {}

	toolItemId(toolCallId: string): string {
		return `${this.options.idPrefix}${toolCallId}`;
	}

	toolCall(toolCallId: string): ToolCall | undefined {
		return this.toolCalls.get(this.toolItemId(toolCallId));
	}

	allToolCalls(): IterableIterator<ToolCall> {
		return this.toolCalls.values();
	}

	openKind(): TextKind | null {
		return this.open?.kind ?? null;
	}

	discardOpen(): void {
		this.open = null;
	}

	handleUpdate(
		variant: string,
		raw: unknown,
		turnId: string,
	): ToolCall | undefined {
		switch (variant) {
			case "agent_message_chunk":
				this.appendText(
					"agent_message",
					raw,
					turnId,
					this.options.reportedModel?.(raw),
				);
				return;
			case "agent_thought_chunk":
				this.appendText("reasoning", raw, turnId);
				return;
			case "user_message_chunk":
				this.appendText("user_message", raw, turnId);
				return;
			case "agent_message": {
				const level = notifyLevelOf(raw);
				if (level !== undefined) {
					const parsed = acpMessageSchema.safeParse(raw);
					this.options.onNotify?.(
						level,
						parsed.success ? messageText(parsed.data.content ?? []) : "",
					);
					return;
				}
				this.handleMessage(
					"agent_message",
					raw,
					turnId,
					this.options.reportedModel?.(raw),
				);
				return;
			}
			case "agent_thought":
				this.handleMessage("reasoning", raw, turnId);
				return;
			case "user_message":
				this.handleMessage("user_message", raw, turnId);
				return;
			case "tool_call":
			case "tool_call_update":
				return this.handleToolCall(raw, turnId);
			case "tool_call_content_chunk":
				this.handleToolCallContentChunk(raw, turnId);
				return;
			case "plan":
				this.handlePlan(raw, turnId);
				return;
			case "plan_update":
				this.handlePlanUpdate(raw, turnId);
				return;
			default:
				return;
		}
	}

	handleParentMessage(
		variant: "user_message" | "user_message_chunk",
		raw: unknown,
		turnId: string,
	): void {
		if (variant === "user_message")
			this.handleMessage("user_message", raw, turnId, undefined, "parent");
		else this.appendText("user_message", raw, turnId, undefined, "parent");
	}

	flush(): void {
		if (!this.open) return;
		const open = this.open;
		this.open = null;
		if (open.messageId)
			this.messages.set(open.messageId, {
				text: open.text,
				attachments: open.attachments,
				startedAtMs: open.startedAtMs,
				...(open.model ? { model: open.model } : {}),
				...(open.from ? { from: open.from } : {}),
			});
		this.emit(this.textItem(open, "flushed"), open.turnId);
	}

	private turnScope(turnId: string): string {
		return this.options.scopeIdsByTurn ? `:${turnId}` : "";
	}

	private appendText(
		kind: TextKind,
		raw: unknown,
		turnId: string,
		model: string | undefined = undefined,
		from?: "parent",
	): void {
		const parsed = acpContentBlockSchema.safeParse(
			(raw as { content?: unknown }).content,
		);
		const content = parsed.success ? parsed.data : undefined;
		const messageId = messageIdOf(raw);
		if (kind === "agent_message" && content && content.type !== "text") {
			const attachment = this.options.attachmentOf(
				content,
				messageId ? `message:${messageId}` : undefined,
			);
			if (!attachment) return;
			const open = this.openMessage(kind, turnId, messageId);
			if (model) open.model = model;
			open.attachments.push(attachment);
			this.emit(this.textItem(open, "open"), turnId);
			return;
		}
		const chunk = content?.type === "text" ? (content.text ?? "") : "";
		if (!chunk) return;
		const open = this.openMessage(kind, turnId, messageId, from);
		if (kind === "agent_message" && model) open.model = model;
		open.text += chunk;
		if (kind !== "user_message") {
			this.options.emitTextDelta(open.itemId, chunk);
			return;
		}
		if (this.options.streamUserMessages)
			this.emit(this.textItem(open, "open"), turnId);
	}

	private openMessage(
		kind: TextKind,
		turnId: string,
		messageId: string | null,
		from?: "parent",
	): OpenText {
		const open = this.open;
		if (
			open &&
			open.kind === kind &&
			open.turnId === turnId &&
			open.messageId === messageId
		)
			return open;
		this.flush();
		const flushed = messageId ? this.messages.get(messageId) : undefined;
		const next: OpenText = {
			itemId: `${this.options.idPrefix}${kind}${this.turnScope(turnId)}:${messageId ?? this.options.mintId()}`,
			kind,
			messageId,
			text: flushed?.text ?? "",
			attachments: [...(flushed?.attachments ?? [])],
			turnId,
			startedAtMs: flushed?.startedAtMs ?? this.options.nextStartMs(),
			...(kind === "agent_message"
				? { model: flushed?.model ?? this.options.defaultModel?.() }
				: {}),
			...((from ?? flushed?.from) ? { from: from ?? flushed?.from } : {}),
		};
		this.open = next;
		if (kind !== "user_message" || this.options.streamUserMessages)
			this.emit(this.textItem(next, "open"), turnId);
		return next;
	}

	private handleMessage(
		kind: TextKind,
		raw: unknown,
		turnId: string,
		model: string | undefined = undefined,
		from?: "parent",
	): void {
		const parsed = acpMessageSchema.safeParse(raw);
		if (!parsed.success) return;
		const open = this.openMessage(kind, turnId, parsed.data.messageId, from);
		if (kind === "agent_message" && model) open.model = model;
		if (parsed.data.content !== undefined) {
			const content = parsed.data.content ?? [];
			open.text = messageText(content);
			open.attachments =
				kind === "agent_message"
					? content.flatMap((block) => {
							const attachment = this.options.attachmentOf(
								block,
								`message:${parsed.data.messageId}`,
							);
							return attachment ? [attachment] : [];
						})
					: [];
		}
		this.flush();
	}

	private textItem(open: OpenText, state: "open" | "flushed"): Item {
		const base = {
			id: open.itemId,
			startedAtMs: open.startedAtMs,
			...(this.options.parentItemId
				? { parentItemId: this.options.parentItemId }
				: {}),
			...(state === "flushed" ? { completedAtMs: this.options.now() } : {}),
		};
		switch (open.kind) {
			case "agent_message": {
				const { model } = open;
				return {
					...base,
					kind: "agent_message",
					text: open.text,
					...(open.messageId ? { agentMessageId: open.messageId } : {}),
					...(open.attachments.length > 0
						? { attachments: open.attachments }
						: {}),
					...(model ? { model } : {}),
				};
			}
			case "user_message":
				return {
					...base,
					kind: "user_message",
					...(open.from ? { from: open.from } : {}),
					content: [{ type: "text", text: open.text }],
				};
			default:
				return { ...base, kind: "reasoning", text: open.text };
		}
	}

	private handleToolCall(raw: unknown, turnId: string): ToolCall | undefined {
		const parsed = acpToolCallUpdateSchema.safeParse(raw);
		if (!parsed.success) return;
		this.flush();
		const update = parsed.data;
		const id = this.toolItemId(update.toolCallId);
		const prior = this.toolCalls.get(id);
		const body =
			update.content === undefined
				? null
				: this.toolBody(update.content ?? [], update.toolCallId);
		const content = body ? body.content : (prior?.content ?? []);
		const attachments = body ? body.attachments : (prior?.attachments ?? []);
		const locations =
			update.locations === undefined
				? prior?.locations
				: (update.locations ?? undefined);
		const rawInput =
			update.rawInput === undefined
				? prior?.rawInput
				: withoutImageData(update.rawInput);
		const rawOutput =
			update.rawOutput === undefined
				? prior?.rawOutput
				: withoutImageData(update.rawOutput);
		const claudeCode = update._meta?.claudeCode;
		const mcpServer = mcpServerOf(update._meta, prior?.mcpServer);
		const item: ToolCall = {
			id,
			kind: "tool_call",
			...(this.options.parentItemId
				? { parentItemId: this.options.parentItemId }
				: {}),
			title: update.title ?? prior?.title ?? "Tool call",
			toolKind: update.kind
				? toolKind(update.kind)
				: (prior?.toolKind ?? "other"),
			toolName:
				update.name ??
				claudeCode?.toolName ??
				update.kind ??
				prior?.toolName ??
				"tool",
			status: update.status
				? toolStatus(update.status)
				: (prior?.status ?? "running"),
			content,
			...(attachments.length > 0 ? { attachments } : {}),
			...(locations?.length ? { locations } : {}),
			startedAtMs: prior?.startedAtMs ?? this.options.nextStartMs(),
			...(toolCallSettled(update.status)
				? { completedAtMs: this.options.now() }
				: prior?.completedAtMs !== undefined
					? { completedAtMs: prior.completedAtMs }
					: {}),
			...(rawInput !== undefined ? { rawInput } : {}),
			...(rawOutput !== undefined ? { rawOutput } : {}),
			...(mcpServer ? { mcpServer } : {}),
		};
		this.toolCalls.set(id, item);
		this.emit(item, turnId);
		return item;
	}

	private handleToolCallContentChunk(raw: unknown, turnId: string): void {
		const parsed = acpToolCallContentChunkSchema.safeParse(raw);
		if (!parsed.success) return;
		this.flush();
		const { toolCallId, content } = parsed.data;
		const id = this.toolItemId(toolCallId);
		const prior = this.toolCalls.get(id);
		const body = this.toolBody([content], toolCallId);
		const attachments = [...(prior?.attachments ?? []), ...body.attachments];
		const item: ToolCall = {
			id,
			kind: "tool_call",
			...(this.options.parentItemId
				? { parentItemId: this.options.parentItemId }
				: {}),
			title: prior?.title ?? "Tool call",
			toolKind: prior?.toolKind ?? "other",
			toolName: prior?.toolName ?? "tool",
			status: prior?.status ?? "running",
			content: [...(prior?.content ?? []), ...body.content],
			...(attachments.length > 0 ? { attachments } : {}),
			...(prior?.locations?.length ? { locations: prior.locations } : {}),
			startedAtMs: prior?.startedAtMs ?? this.options.nextStartMs(),
			...(prior?.completedAtMs !== undefined
				? { completedAtMs: prior.completedAtMs }
				: {}),
			...(prior?.rawInput !== undefined ? { rawInput: prior.rawInput } : {}),
			...(prior?.rawOutput !== undefined ? { rawOutput: prior.rawOutput } : {}),
			...(prior?.mcpServer ? { mcpServer: prior.mcpServer } : {}),
		};
		this.toolCalls.set(id, item);
		this.emit(item, turnId);
	}

	private toolBody(
		content: AcpToolCallContent[],
		toolCallId: string,
	): { content: ToolContent[]; attachments: ItemAttachment[] } {
		return mapToolBody(content, toolCallId, (block, referenceId) =>
			this.options.attachmentOf(block, referenceId),
		);
	}

	private handlePlan(raw: unknown, turnId: string): void {
		const parsed = acpPlanSchema.safeParse(raw);
		if (!parsed.success) return;
		this.flush();
		this.emit(
			{
				id: `${this.options.idPrefix}plan${this.turnScope(turnId)}`,
				kind: "plan",
				...(this.options.parentItemId
					? { parentItemId: this.options.parentItemId }
					: {}),
				startedAtMs: this.options.nextStartMs(),
				entries: planEntryItems(parsed.data.entries),
			},
			turnId,
		);
	}

	private handlePlanUpdate(raw: unknown, turnId: string): void {
		const parsed = acpPlanUpdateSchema.safeParse(raw);
		if (!parsed.success) return;
		const { planId, entries } = parsed.data.plan;
		if (!entries) return;
		this.flush();
		const prior = this.planItems.get(planId);
		const startedAtMs = prior ?? this.options.nextStartMs();
		this.planItems.set(planId, startedAtMs);
		this.emit(
			{
				id: `${this.options.idPrefix}plan${this.turnScope(turnId)}:${planId}`,
				kind: "plan",
				...(this.options.parentItemId
					? { parentItemId: this.options.parentItemId }
					: {}),
				startedAtMs,
				entries: planEntryItems(entries),
			},
			turnId,
		);
	}

	private emit(item: Item, turnId: string): void {
		this.options.emitItem(item, turnId);
	}
}

function notifyLevelOf(raw: unknown): string | undefined {
	const meta = (raw as { _meta?: { piAcp?: { notify?: { level?: unknown } } } })
		?._meta;
	const notify = meta?.piAcp?.notify;
	if (!notify) return undefined;
	return typeof notify.level === "string" ? notify.level : "info";
}
