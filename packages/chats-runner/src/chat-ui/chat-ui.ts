import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type {
	ExtensionUIContext,
	ExtensionUIDialogOptions,
} from "@earendil-works/pi-coding-agent";

/** One question of a form: one pick, or several with `multiSelect`; "Other…" with `allowOther`. */
interface FormPart {
	header: string;
	title: string;
	options: { label: string; description?: string }[];
	allowOther: boolean;
	multiSelect: boolean;
}

/** One form question's answer: the options picked, and what was typed under "Other…". */
export interface FormAnswer {
	picked: string[];
	typed: string | null;
}

/** A question card as the API takes it (`POST /cli/questions`). */
export interface QuestionCard {
	kind: "select" | "confirm" | "input" | "form";
	title: string;
	body?: string;
	options?: { label: string; description?: string }[];
	/** A form's questions, answered together. */
	parts?: FormPart[];
	allowOther?: boolean;
	placeholder?: string;
	/** `asker`, `anyone`, or a person's name; omitted, the API picks (see askSchema). */
	answerer?: string;
	timeoutMs?: number;
}

/** Where a question stands, as the API's long poll reports it. */
export type QuestionStatus =
	| { status: "open" }
	/** `answers`: a form's, one per question. */
	| {
			status: "answered";
			answer: string;
			typed: boolean;
			answers?: FormAnswer[] | null;
	  }
	| { status: "expired" | "cancelled" };

/** The API calls behind the chat's extension UI, for one chat. */
export interface QuestionApi {
	ask(card: QuestionCard): Promise<{ id: string }>;
	/** One long poll: resolves when the question is settled or the API's wait is up (`open`); rejects on abort. */
	wait(id: string, signal: AbortSignal): Promise<QuestionStatus>;
	/**
	 * Stops the turn waiting: the card stays open and its answer starts a new turn. Returns `open` once let go, or what
	 * settled the question first.
	 */
	release(id: string): Promise<QuestionStatus>;
	cancel(id: string): Promise<void>;
	notify(text: string): Promise<void>;
}

/**
 * What a chat can show of a select that pi's `select(title, options)` has no room for: each option's description, who
 * should answer, and which option is "Other…" (a typed answer). Keyed by the options array the caller passes on, so
 * any UI that ignores it still shows a plain select.
 */
export interface SelectExtras {
	descriptions?: (string | undefined)[];
	answerer?: string;
	/** The option that stands for a typed answer; the next `input` call returns what was typed. */
	other?: string;
}

const selectExtras = new WeakMap<readonly string[], SelectExtras>();

/** Attaches `extras` to a select's `options`, for the chat's card; returns the same array. */
export function describeSelect(
	options: string[],
	extras: SelectExtras,
): string[] {
	selectExtras.set(options, extras);
	return options;
}

/**
 * How long a turn waits on its question before letting go. One turn per Dev runs at a time, so a turn held open by
 * a question would hold up the Dev's other chats; after this the turn ends and the answer starts a new one. A poll
 * in flight finishes first, so the wait runs up to one poll (25 s) longer.
 */
const IN_TURN_WAIT_MS = 60_000;
/** Before asking again after the API couldn't be reached. */
const RETRY_MS = 1_000;

/** How a question ended for the turn that asked: `released` when the turn let go and the card stays open. */
type Settled =
	| Exclude<QuestionStatus, { status: "open" }>
	| { status: "released" };

/** The question's line in the turn's trace, when nobody answered it. */
const SETTLED_TEXT: Record<Exclude<Settled["status"], "answered">, string> = {
	released: "No answer yet; it will come in a new turn",
	expired: "No answer in time",
	cancelled: "Stopped asking",
};

const unsupported = (method: string) => () => {
	throw new Error(
		`ctx.ui.${method} needs pi's terminal; in a Dev chat use select, confirm or input`,
	);
};

/** The chat's extension UI, plus a form: several questions (or one taking several answers) on one card. */
export type ChatUi = ExtensionUIContext & {
	/** Asks `parts` together; resolves with an answer per part, or undefined as a dismissed dialog does. */
	askForm(
		form: { title: string; parts: FormPart[]; answerer?: string },
		signal?: AbortSignal,
	): Promise<FormAnswer[] | undefined>;
};

/**
 * pi's extension UI in a chat: `select`, `confirm` and `input` become question cards that wait for a person's answer,
 * `notify` a note. Each dialog posts its card, waits on the API's long poll, and resolves with the answer, so the tool
 * that asked carries on where it was. It resolves as dismissed (undefined, or false for confirm) when nobody answered
 * within `IN_TURN_WAIT_MS` (the card stays open and the answer starts a new turn), when it expired, when the turn is
 * cancelled (`turnSignal`, as pi's own abort signal may not reach a dialog) or when the caller's signal aborts.
 * `onUpdate` puts each question in the turn's stream (and so its trace). Terminal-only methods fail, so an extension
 * sees it has no terminal; display-only ones do nothing.
 */
export function createChatUi(opts: {
	api: QuestionApi;
	turnSignal: () => AbortSignal | undefined;
	onUpdate: (update: SessionUpdate) => void;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
}): ChatUi {
	const now = opts.now ?? Date.now;
	const sleep =
		opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
	/** What was typed for a select's "Other…", for the `input` call that follows it. */
	let typed: string | null = null;

	async function ask(
		card: QuestionCard,
		dialog: ExtensionUIDialogOptions | undefined,
	): Promise<Settled> {
		const signals = [dialog?.signal, opts.turnSignal()].filter(
			(s): s is AbortSignal => !!s,
		);
		const signal = AbortSignal.any(signals);
		if (signal.aborted) return { status: "cancelled" };
		const { id } = await opts.api.ask({
			...card,
			...(dialog?.timeout ? { timeoutMs: dialog.timeout } : {}),
		});
		const toolCallId = `question-${id}`;
		opts.onUpdate({
			sessionUpdate: "tool_call",
			toolCallId,
			title: `Asked: ${card.title}`,
			kind: "other",
			status: "pending",
			rawInput: card,
		});
		const settle = (result: Settled) => {
			const text =
				result.status === "answered"
					? `Answer: ${result.answer}`
					: SETTLED_TEXT[result.status];
			opts.onUpdate({
				sessionUpdate: "tool_call_update",
				toolCallId,
				status: result.status === "answered" ? "completed" : "failed",
				content: [{ type: "content", content: { type: "text", text } }],
			});
			return result;
		};
		const deadline = now() + IN_TURN_WAIT_MS;
		for (;;) {
			if (signal.aborted) {
				void opts.api.cancel(id).catch(() => {});
				return settle({ status: "cancelled" });
			}
			if (now() >= deadline) break;
			let result: QuestionStatus;
			try {
				result = await opts.api.wait(id, signal);
			} catch (err) {
				if (signal.aborted) continue;
				// A refused poll (the turn ended on the API's side) won't get better; a dropped connection may.
				if (
					(err as { status?: number }).status &&
					(err as { status: number }).status < 500
				)
					return settle({ status: "cancelled" });
				await sleep(RETRY_MS);
				continue;
			}
			if (result.status !== "open") return settle(result);
		}
		// If the API can't be reached, the question stays the turn's, and the turn's end cancels it.
		const released = await opts.api
			.release(id)
			.catch((): QuestionStatus => ({ status: "cancelled" }));
		return settle(
			released.status === "open" ? { status: "released" } : released,
		);
	}

	return {
		async select(title, options, dialog) {
			typed = null;
			const extras = selectExtras.get(options) ?? {};
			const shown = options
				.map((label, i) => ({
					label,
					...(extras.descriptions?.[i]
						? { description: extras.descriptions[i] }
						: {}),
				}))
				.filter((o) => o.label !== extras.other);
			const result = await ask(
				{
					kind: "select",
					title,
					options: shown,
					allowOther: extras.other !== undefined,
					answerer: extras.answerer,
				},
				dialog,
			);
			if (result.status !== "answered") return undefined;
			if (result.typed && extras.other !== undefined) {
				typed = result.answer;
				return extras.other;
			}
			return result.answer;
		},
		async confirm(title, message, dialog) {
			typed = null;
			const result = await ask(
				{ kind: "confirm", title, body: message },
				dialog,
			);
			return result.status === "answered" && result.answer === "yes";
		},
		async input(title, placeholder, dialog) {
			if (typed !== null) {
				const answer = typed;
				typed = null;
				return answer;
			}
			const result = await ask(
				{ kind: "input", title, placeholder: placeholder ?? "" },
				dialog,
			);
			return result.status === "answered" ? result.answer : undefined;
		},
		async askForm(form, signal) {
			typed = null;
			const result = await ask(
				{
					kind: "form",
					title: form.title,
					parts: form.parts,
					answerer: form.answerer,
				},
				signal ? { signal } : undefined,
			);
			return result.status === "answered"
				? (result.answers ?? undefined)
				: undefined;
		},
		notify(message) {
			void opts.api
				.notify(message)
				.catch((err: unknown) =>
					console.error("dev-runner: couldn't post a note:", err),
				);
		},
		custom: unsupported("custom"),
		editor: unsupported("editor"),
		onTerminalInput: () => () => {},
		setStatus() {},
		setWorkingMessage() {},
		setWorkingVisible() {},
		setWorkingIndicator() {},
		setHiddenThinkingLabel() {},
		setWidget() {},
		setFooter() {},
		setHeader() {},
		setTitle() {},
		pasteToEditor() {},
		setEditorText() {},
		getEditorText: () => "",
		addAutocompleteProvider() {},
		setEditorComponent() {},
		getEditorComponent: () => undefined,
		// pi copies the context (getters included) when it binds it, so this can't throw; a chat has no theme to give.
		theme: undefined as unknown as ExtensionUIContext["theme"],
		getAllThemes: () => [],
		getTheme: () => undefined,
		setTheme: () => ({ success: false, error: "A Dev chat has no themes" }),
		getToolsExpanded: () => false,
		setToolsExpanded() {},
	};
}

/** An API error with its status, so the dialog can tell a refusal from a dropped connection. */
class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

/**
 * The question calls over HTTP, naming the chat (the box's proxy adds its credential); they act as the Dev's running
 * turn there. Answers come back by long poll rather than a call into the box: the box only ever calls out, through the
 * same proxy as every other request, any API instance can answer the poll (answers are in Postgres), and a dropped
 * poll is simply asked again.
 */
export function questionsOverHttp(apiUrl: string, chatId: string): QuestionApi {
	const base = apiUrl.replace(/\/+$/, "");
	async function call<T>(
		method: string,
		path: string,
		body?: unknown,
		signal?: AbortSignal,
	): Promise<T> {
		const res = await fetch(`${base}${path}`, {
			method,
			headers: {
				"x-dev-chat": chatId,
				...(body === undefined ? {} : { "content-type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal,
		});
		if (!res.ok) {
			const error = (await res.json().catch(() => ({}))) as {
				message?: string;
			};
			throw new ApiError(
				res.status,
				error.message ?? `The API answered ${res.status}`,
			);
		}
		return (res.status === 204 ? undefined : await res.json()) as T;
	}
	return {
		ask: async (card) =>
			(await call<{ question: { id: string } }>("POST", "/cli/questions", card))
				.question,
		wait: (id, signal) =>
			call<QuestionStatus>(
				"GET",
				`/cli/questions/${id}/answer`,
				undefined,
				signal,
			),
		release: (id) =>
			call<QuestionStatus>("POST", `/cli/questions/${id}/release`),
		cancel: (id) => call("POST", `/cli/questions/${id}/cancel`),
		notify: (text) => call("POST", "/cli/notify", { text }),
	};
}
