import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	type AssistantMessage,
	type FauxResponseStep,
	fauxAssistantMessage,
	fauxProvider,
	fauxText,
	fauxThinking,
	fauxToolCall,
	type Model,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import {
	AUTO,
	type RouterTiers,
	routerModel,
	routerTiersFromEnv,
} from "../model-router/model-router.ts";
import { HANDOVER_REQUEST } from "../rollover/rollover.ts";
import { budgetApp } from "./faux-apps.ts";

const GATEWAY = "vercel-ai-gateway";
const DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";
/** The classifier `auto` asks how much work a turn is. */
const JEV = "typesafe-ai/jev";

export interface ModelConfig {
	/** Dev API base URL; the model proxy lives at `<apiUrl>/model`. */
	apiUrl: string;
	/** Gateway model id, e.g. `anthropic/claude-sonnet-5.5`, or `auto` to route each turn between `tiers`. */
	modelId?: string;
	/** The models `auto` routes between (DEV_MODELS_FAST, _MEDIUM, _STRONG). */
	tiers?: RouterTiers;
	/** Scripted model for tests and keyless dev: no network, no tokens spent. */
	faux?: boolean;
	/** The session's working directory (/agent in a box); the dev model writes its app files here. */
	agentDir?: string;
	/** The session's chat, named on every model request: the API meters it as the Dev's turn running there. */
	chatId?: string;
}

/** A model for one pi session. */
export interface SessionModel {
	runtime: ModelRuntime;
	model: Model<string>;
}

/**
 * The key pi's gateway provider sends. The box holds no credential: its network proxy adds the box's to every request
 * to the API, which checks that instead.
 */
const PLACEHOLDER_KEY = "dev-box";

/**
 * The real model is the AI Gateway reached only through the Dev server's proxy; the box never holds a gateway key.
 * Each pi session gets its own runtime, naming its own chat (two sessions on one box are two groups).
 */
export async function createSessionModel(
	config: ModelConfig,
): Promise<SessionModel> {
	// pi's auth file holds only the placeholder key; it stays out of /agent (the Drive) all the same.
	const runtime = await ModelRuntime.create({
		authPath: join(tmpdir(), "dev-runner", "auth.json"),
		modelsPath: null,
		refreshOnCreate: false,
	});
	if (config.faux) {
		const faux = fauxProvider({ tokensPerSecond: FAUX_TOKENS_PER_SECOND });
		faux.setResponses([
			replying(
				devScript(config.agentDir ?? process.cwd()),
				faux.appendResponses,
			),
		]);
		runtime.registerNativeProvider(faux.provider);
		return { runtime, model: faux.getModel() };
	}
	const proxy = `${config.apiUrl.replace(/\/+$/, "")}/model`;
	const headers: Record<string, string> = config.chatId
		? { "x-dev-chat": config.chatId }
		: {};
	runtime.registerProvider(GATEWAY, { baseUrl: proxy, headers });
	await runtime.setRuntimeApiKey(GATEWAY, PLACEHOLDER_KEY);
	if (config.modelId === AUTO) {
		const jev = runtime.getModelOfType("classifier", GATEWAY, JEV);
		runtime.registerVirtualModel(
			routerModel({
				tiers: config.tiers ?? routerTiersFromEnv({}),
				model: (id) => runtime.getModel(GATEWAY, id),
				// Jev's own route on the proxy (`/model/typesafe/v1/systemone`), metered to the chat like the chat models.
				classify: jev
					? (context, signal) =>
							runtime.classify(
								{ ...jev, baseUrl: `${proxy}/typesafe/v1` },
								context,
								{ signal, transformHeaders: (h) => ({ ...h, ...headers }) },
							)
					: null,
				log: (line) =>
					console.log(`dev-runner: chat ${config.chatId ?? "?"} ${line}`),
			}),
		);
		return { runtime, model: runtime.getModel("dev", AUTO)! };
	}
	const model = runtime.getModel(GATEWAY, config.modelId ?? DEFAULT_MODEL);
	if (!model) throw new Error(`Unknown gateway model ${config.modelId}`);
	return { runtime, model };
}

/** Slow enough that a person watching the stream sees it arrive, fast enough that tests stay quick. */
const FAUX_TOKENS_PER_SECOND = 20;
/** Put this in a message to make the dev model fail, to see how the app shows a failed turn. */
const FAUX_ERROR_TRIGGER = "[faux:error]";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** What `dev ask` says when a name matches several Devs. */
const AMBIGUOUS = /Retry with an id/;

type FauxContext = Parameters<
	Extract<FauxResponseStep, (...args: never[]) => unknown>
>[0];

const textOf = (content: unknown) =>
	typeof content === "string"
		? content
		: Array.isArray(content)
			? content
					.map((c: { type: string; text?: string }) =>
						c.type === "text" ? c.text : "",
					)
					.join("")
			: "";

/** The turn's prompt and the results of the tools run since, oldest first. */
function turnSoFar(context: FauxContext) {
	const messages = context.messages;
	const start = messages.findLastIndex((m) => m.role === "user");
	const prompt = start >= 0 ? textOf(messages[start]!.content) : "";
	const results = messages
		.slice(start + 1)
		.flatMap((m) =>
			m.role === "toolResult" ? [textOf(m.content).trim()] : [],
		);
	return { prompt, results };
}

/** Where a turn's input moves on from what happened to the chat around it (see turnInput). */
const CONTEXT_BLOCK =
	/\n\n(?:New session:|Since your last turn here|In this chat)/;
/** How a subagent's prompt starts (see subagents); it has no bash, so the dev model just answers. */
const SUBAGENT_TASK = "Task: ";
/** How a `dev ask` turn's header starts (see the server's turn prompts). */
const QUESTION = "## Question from";
const NEW_DEV = "## New Dev";
const NEW_GROUP = "## New group";
const EVENTS = "## Events";

/** One event as an `## Events` input lists it: its number, and for a task comment, its task and words. */
function eventsOf(message: string) {
	return [
		...message.matchAll(/^### (\d+)\. [^\n]*\n(?:[^\n]*\n){2}(.*)$/gm),
	].map(([, n, payload]) => {
		const task = new RegExp(`"task":\\{"id":"(${UUID})"`).exec(
			payload ?? "",
		)?.[1];
		const words = /"comment":\{[^}]*"text":"((?:[^"\\]|\\.)*)"/.exec(
			payload ?? "",
		)?.[1];
		return {
			n: Number(n),
			task,
			words: words && (JSON.parse(`"${words}"`) as string),
		};
	});
}

/** Answers each task comment on its task, reports every event, and sums the batch up in a line. */
function handleEvents(results: string[], message: string) {
	const events = eventsOf(message);
	const comments = events.filter((e) => e.task && e.words !== undefined);
	const answers = comments.map(
		(c) => `dev task comment ${c.task} ${quote(`Got it: ${c.words}`)}`,
	);
	if (results.length === 0 && answers.length) {
		return fauxAssistantMessage(
			[
				fauxThinking("Comments on my tasks: I'll answer each on its task."),
				bash(answers.join(" && ")),
			],
			{ stopReason: "toolUse" },
		);
	}
	if (results.length === (answers.length ? 1 : 0)) {
		const reports = events.map((e) =>
			e.task
				? { event: e.n, action: "acted", note: "Answered on the task" }
				: { event: e.n, action: "skipped", note: "Nothing needed" },
		);
		return fauxAssistantMessage(
			[fauxToolCall("report_events", { events: reports })],
			{ stopReason: "toolUse" },
		);
	}
	return fauxAssistantMessage(
		comments.length
			? `Answered ${comments.length} ${comments.length === 1 ? "comment" : "comments"} on my tasks.`
			: `Nothing needed for ${events.length} events.`,
	);
}

/** The handover note a closing session writes: what people asked in it, newest last. */
function handoverNote(context: FauxContext) {
	const asked = context.messages
		.filter((m) => m.role === "user")
		.map(
			(m) => textOf(m.content).split("\n\n")[1]?.split("\n")[0]?.trim() ?? "",
		)
		.filter((line) => line && !line.startsWith("[Dev: handover]"));
	return fauxAssistantMessage(
		`Handover: ${asked.length} messages so far. Asked: ${asked.map((a) => `"${a}"`).join(", ")}.`,
	);
}

const bash = (command: string) => fauxToolCall("bash", { command });
/**
 * Writes an app file as the model's step. The faux provider streams tool arguments at its slow demo pace (a 9 KB file
 * would take minutes), so the dev model saves the file itself and shows it with a `read` call instead of a `write`.
 */
function writeAppFile(cwd: string, path: string, content: string) {
	mkdirSync(dirname(join(cwd, path)), { recursive: true });
	writeFileSync(join(cwd, path), content);
	return fauxToolCall("read", { path });
}
const quote = (text: string) => `"${text.replace(/["\\$`]/g, "\\$&")}"`;

/**
 * The keyless dev model: drives the whole loop (box, ACP stream, `dev` CLI, realtime) without a gateway key, and
 * streams thinking, text and tool calls like a real model so the app's live view has something to show.
 * - An agent's task gets a one-line answer, "Done: <task>"; a message containing "with subagents" runs an agent to plan
 *   then another to write it up (two `agent` calls kept in the turn) and replies with the second's result.
 * - A question from another Dev (`dev ask`) gets a plain-text answer.
 * - Asked for a handover note (a rollover), it lists what people said in the session.
 * What it ends with is its reply, posted with the `reply` tool in a message's turn (see `replying`); only the budget app
 * posts an interim update (`send_update`) first.
 * - A message containing `ask <dev-id>` or `ask <name>:` asks that Dev and replies with its answer. When a name
 *   is refused (several Devs share it), it retries with the first id the error lists, as a model would.
 * - "make/build … budget app": say it's on it (`send_update`), write a single-file React budget app (shared storage, an
 *   even split), publish it with `dev app publish` and say it's live; "update/improve … budget app" finds it with `dev app list`, writes
 *   version 2 (adds "Settle up") and publishes it with `--app <id>`.
 * - "use linear": comment on a Linear issue through the owner's connected Linear (Composio's run tool, an MCP tool through
 *   the API's proxy) and reply with what it answered. A group's Dev has no connected apps: it asks the Dev its
 *   prompt lists with Linear, and that Dev (asked "use linear …") calls the tool and answers with the result.
 * - "update your brief": rewrites its brief of the chat (`dev brief`, two topics, one needing someone) and says so.
 * - A new Dev's first turn (`## New Dev`): says hello and asks what to help with.
 * - A new group's own Dev's first turn (`## New group`): says hello to the group and how to ask it.
 * - An `## Events` turn: answers each comment on a task on its task ("Got it: …", `dev task comment`), reports every
 *   event (`report_events`: a comment acted on, anything else skipped) and ends with a one-line summary.
 * - Anything else: read the chat, then answer "hello from <name>"; a message containing `greet @<name>` makes it
 *   "hello @<name>, from <name>" (the server turns a unique @name into a mention).
 */
function devScript(cwd: string): DevStep {
	return (context) => {
		const { prompt, results } = turnSoFar(context);
		if (prompt === HANDOVER_REQUEST) return handoverNote(context);
		if (prompt.startsWith(SUBAGENT_TASK))
			return fauxAssistantMessage(
				`Done: ${prompt.slice(SUBAGENT_TASK.length).split("\n")[0]}`,
			);
		// What happened comes first in the input; the chat's messages and roster below it must not re-trigger an ask.
		const message = prompt.split(CONTEXT_BLOCK)[0] ?? "";
		if (message.includes(FAUX_ERROR_TRIGGER)) {
			return fauxAssistantMessage([], {
				stopReason: "error",
				errorMessage: "the model is unavailable (scripted dev failure)",
			});
		}
		if (message.startsWith(NEW_DEV)) {
			return fauxAssistantMessage([
				fauxThinking(
					"I was just made: I'll say hello and ask what to help with.",
				),
				fauxText(
					`Hi, I'm ${process.env.DEV_NAME ?? "Dev"}. What would you like me to help you with?`,
				),
			]);
		}
		if (message.startsWith(NEW_GROUP)) {
			const name = process.env.DEV_NAME ?? "Dev";
			return fauxAssistantMessage([
				fauxThinking("A new group: I'll say hello and how to ask me."),
				fauxText(
					`Hi everyone, I'm ${name}, this group's Dev. Mention me (@${name}) whenever you need a hand.`,
				),
			]);
		}
		if (message.startsWith(EVENTS)) return handleEvents(results, message);
		if (message.startsWith(QUESTION) && /\buse linear\b/i.test(message))
			return linearForAsker(results);
		if (message.startsWith(QUESTION)) {
			return fauxAssistantMessage([
				fauxThinking("Checking my person's calendar."),
				fauxText("My person is free on Saturday morning."),
			]);
		}
		const asked = new RegExp(`\\bask (?:(${UUID})\\b|([^\\s:]+):)`, "i").exec(
			message,
		);
		if (asked) {
			const question = '"When are you free this weekend?"';
			if (results.length === 0) {
				const target = asked[1] ?? quote(asked[2]!);
				return fauxAssistantMessage(
					[
						fauxThinking("I should ask the other Dev directly."),
						fauxText("Asking them now."),
						bash(`dev ask ${target} ${question}`),
					],
					{
						stopReason: "toolUse",
					},
				);
			}
			const last = results.at(-1)!;
			const retryId =
				results.length === 1 && AMBIGUOUS.test(last)
					? new RegExp(UUID, "i").exec(last)?.[0]
					: undefined;
			if (retryId) {
				return fauxAssistantMessage(
					[
						fauxThinking(
							"That name is ambiguous; I'll use the first id it listed.",
						),
						bash(`dev ask ${retryId} ${question}`),
					],
					{ stopReason: "toolUse" },
				);
			}
			return fauxAssistantMessage(`They said: ${last}`);
		}
		if (/\buse linear\b/i.test(message)) return useLinear(results, prompt);
		if (/\bwith subagents\b/i.test(message)) return delegate(results, message);
		if (/\bupdate your brief\b/i.test(message)) {
			if (results.length === 0) {
				return fauxAssistantMessage(
					[
						fauxThinking("What's in play here changed; I'll rewrite my brief."),
						bash(
							`dev brief ${quote("!Your list: a pile of tasks is due today, worth sorting together")} ${quote("This chat: I read it and I'm keeping an eye on it")}`,
						),
					],
					{ stopReason: "toolUse" },
				);
			}
			return fauxAssistantMessage(
				results.at(-1)!.startsWith("Brief updated")
					? "I've updated my brief of this chat."
					: `I couldn't update my brief: ${results.at(-1)}`,
			);
		}
		if (/\b(?:make|build)\b[^.?!]*\bbudget app\b/i.test(message))
			return buildBudget(results, cwd);
		if (/\b(?:update|improve|change)\b[^.?!]*\bbudget app\b/i.test(message))
			return updateBudget(results, cwd);
		const name = process.env.DEV_NAME ?? "Dev";
		if (results.length === 0) {
			return fauxAssistantMessage(
				[
					fauxThinking("A new message. I'll read the chat first, then answer."),
					fauxText("Reading the chat first."),
					bash("dev chat read --limit 5"),
				],
				{
					stopReason: "toolUse",
				},
			);
		}
		const greet = /\bgreet (@[^\s,.!?"]+)/i.exec(message)?.[1];
		return fauxAssistantMessage([
			fauxThinking("Nothing else needs an answer, so I'll say hello back."),
			fauxText(greet ? `hello ${greet}, from ${name}` : `hello from ${name}`),
		]);
	};
}

/** How the turns that reply in the chat open (see the server's turn prompts); a task's, an ask's or events' don't. */
const CHAT_TURN =
	/^## (?:New message|Answer to your question|New Dev|New group)\b/;

type DevStep = (context: FauxContext) => AssistantMessage;

/**
 * The dev script as a Dev that replies: in a message's turn its last words go out with the `reply` tool (its final
 * text isn't posted), then it ends with nothing; elsewhere its last words stay its final text. The reply's own result
 * is never shown to the script, so its steps count tool results as before. Each step queues the next, so it never
 * runs out of responses.
 */
function replying(
	script: DevStep,
	append: (steps: FauxResponseStep[]) => void,
): FauxResponseStep {
	const step: FauxResponseStep = (context) => {
		append([step]);
		const last = context.messages.at(-1);
		if (last?.role === "toolResult" && last.toolName === "reply")
			return fauxAssistantMessage([]);
		const response = script(context);
		if (
			!CHAT_TURN.test(turnSoFar(context).prompt) ||
			response.stopReason !== "stop"
		)
			return response;
		const text = response.content
			.flatMap((c) => (c.type === "text" ? [c.text] : []))
			.join("");
		if (!text.trim()) return response;
		return fauxAssistantMessage(
			[
				...response.content.filter((c) => c.type === "thinking"),
				fauxToolCall("reply", { text }),
			],
			{ stopReason: "toolUse" },
		);
	};
	return step;
}

/** An agent's result kept in the turn, without the line on how to follow up that the tool adds. */
const agentResult = (text: string) => text.split("\n\n(agent ")[0]!;

/** An agent to plan then one to write up the message's request (agents kept in the turn), and the second's result as the reply. */
function delegate(results: string[], message: string) {
	const request = message.split("\n\n").slice(1).join(" ").trim();
	if (results.length === 0) {
		const plan = {
			description: "plan it",
			prompt: `Plan this: ${request}`,
			run_in_background: false,
		};
		return fauxAssistantMessage(
			[
				fauxThinking(
					"A longer piece of work: one agent plans, then another writes.",
				),
				fauxToolCall("agent", plan),
			],
			{ stopReason: "toolUse" },
		);
	}
	if (results.length === 1) {
		const write = {
			description: "write it up",
			prompt: `Write this plan up for the chat: ${agentResult(results[0]!)}`,
			run_in_background: false,
		};
		return fauxAssistantMessage([fauxToolCall("agent", write)], {
			stopReason: "toolUse",
		});
	}
	return fauxAssistantMessage(agentResult(results[1]!));
}

/** Composio's run tool in the owner's connected Linear, as pi names it: `mcp__<server>__<tool>`, the server `composio-linear`. */
const LINEAR_RUN = "mcp__composio_linear__COMPOSIO_MULTI_EXECUTE_TOOL";
/** Connected apps' tools are deferred: loaded with `tool_search` before they're called. */
const loadLinear = fauxToolCall("tool_search", {
	query: "linear multi execute tool",
	limit: 3,
});
const linearComment = (name: string) =>
	fauxToolCall(LINEAR_RUN, {
		tools: [
			{
				tool_slug: "LINEAR_CREATE_COMMENT",
				arguments: { issue_id: "SUP-1", body: `hello from ${name}` },
			},
		],
	});

/** A Dev with Linear, as the server lists them to a group's Dev: "- Juniper (alice's) · <id> · Gmail, Linear". */
const LINEAR_HOLDER = new RegExp(`^- (.+) · (${UUID}) · .*\\bLinear\\b`, "im");

function useLinear(results: string[], prompt: string) {
	const name = process.env.DEV_NAME ?? "Dev";
	const holder = LINEAR_HOLDER.exec(prompt);
	if (holder) {
		if (results.length === 0) {
			return fauxAssistantMessage(
				[
					fauxThinking(
						`I have no connected apps; ${holder[1]} has Linear, so I'll ask it.`,
					),
					bash(
						`dev ask ${holder[2]} ${quote("use linear and tell me what it says")}`,
					),
				],
				{
					stopReason: "toolUse",
				},
			);
		}
		return fauxAssistantMessage(`${holder[1]} used Linear: ${results[0]}`);
	}
	if (results.length === 0)
		return fauxAssistantMessage(
			[
				fauxThinking(
					"I have Linear; I'll load its tool and comment through it.",
				),
				loadLinear,
			],
			{ stopReason: "toolUse" },
		);
	if (results.length === 1)
		return fauxAssistantMessage([linearComment(name)], {
			stopReason: "toolUse",
		});
	return fauxAssistantMessage(`Linear said: ${results[1]}`);
}

/** Asked by another Dev to use Linear: call the tool, answer with its result as plain text. */
function linearForAsker(results: string[]) {
	if (results.length === 0)
		return fauxAssistantMessage([loadLinear], { stopReason: "toolUse" });
	if (results.length === 1)
		return fauxAssistantMessage(
			[linearComment(process.env.DEV_NAME ?? "Dev")],
			{ stopReason: "toolUse" },
		);
	return fauxAssistantMessage(results[1]!);
}

/** Relative to the session's cwd, which is /agent in a box. */
const BUDGET_PATH = "apps/budget/Budget.jsx";

function buildBudget(results: string[], cwd: string) {
	switch (results.length) {
		case 0:
			return fauxAssistantMessage(
				[
					fauxToolCall("send_update", {
						text: "On it: I'll build a small budget app here.",
					}),
				],
				{ stopReason: "toolUse" },
			);
		case 1:
			return fauxAssistantMessage(
				[
					fauxThinking(
						"A shared budget: expenses in shared storage so everyone sees them live, split evenly between the chat's people.",
					),
					fauxText(
						`I'll build it as a small app in this chat: ${BUDGET_PATH}.`,
					),
					writeAppFile(cwd, BUDGET_PATH, budgetApp({ settleUp: false })),
				],
				{ stopReason: "toolUse" },
			);
		case 2:
			return fauxAssistantMessage(
				[
					bash(
						`dev app publish ${BUDGET_PATH} --title Budget --label "first version"`,
					),
				],
				{ stopReason: "toolUse" },
			);
		default:
			return fauxAssistantMessage(
				results[2]!.includes("App id:")
					? "Budget is live: open the Budget tab, add what you paid, and it splits the total evenly."
					: `I couldn't publish the app: ${results[2]}`,
			);
	}
}

function updateBudget(results: string[], cwd: string) {
	const appId = new RegExp(`^(${UUID})\\s+Budget\\b`, "im").exec(
		results[0] ?? "",
	)?.[1];
	if (results.length === 0)
		return fauxAssistantMessage(
			[fauxThinking("Which app is the budget?"), bash("dev app list")],
			{ stopReason: "toolUse" },
		);
	if (!appId) {
		return fauxAssistantMessage(
			"There's no budget app in this chat yet. Ask me to make one.",
		);
	}
	switch (results.length) {
		case 1:
			return fauxAssistantMessage(
				[
					fauxText("Adding who pays whom."),
					writeAppFile(cwd, BUDGET_PATH, budgetApp({ settleUp: true })),
				],
				{ stopReason: "toolUse" },
			);
		case 2:
			return fauxAssistantMessage(
				[
					bash(
						`dev app publish ${BUDGET_PATH} --app ${appId} --label "adds settle-up"`,
					),
				],
				{ stopReason: "toolUse" },
			);
		default:
			return fauxAssistantMessage(
				"Updated Budget: it now shows who pays whom to settle up.",
			);
	}
}
