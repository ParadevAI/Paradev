import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ChatSelections } from "@superset/chat/core";
import {
	AGENT_DEFAULT_MODE,
	type SessionConfigOption,
} from "@superset/chat/protocol";
import type { HarnessStartOptions } from "../../harness";
import { FakeHarness } from "../../harness/fake";
import { agentMessage, turn } from "../../testing/fixtures";
import { createTestRuntime } from "../../testing/testRuntime";
import { FAKE_HARNESS, waitFor } from "../../testing/testUtils";

const OTHER_HARNESS = "other-fake";

const configOptions: SessionConfigOption[] = [
	{
		id: "model",
		label: "Model",
		category: "model",
		currentValue: "default",
		options: [
			{ id: "default", label: "Default" },
			{ id: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
		],
	},
	{
		id: "effort",
		label: "Effort",
		category: "thought_level",
		currentValue: "medium",
		options: [
			{ id: "medium", label: "Medium" },
			{ id: "high", label: "High" },
		],
	},
	{
		id: "fast",
		label: "Fast mode",
		currentValue: "off",
		options: [
			{ id: "off", label: "Off" },
			{ id: "on", label: "On" },
		],
	},
];

function selectionRuntime() {
	const starts: ChatSelections[] = [];
	const held: (() => void)[] = [];
	let holdSettings = false;
	const hold = (on: boolean) => {
		holdSettings = on;
	};
	class SelectableHarness extends FakeHarness {
		private options = configOptions;

		private started: ChatSelections = {};

		override start(options: HarnessStartOptions) {
			const { modelId, effortId, modeId, fast } = options;
			this.started = {
				...(modelId ? { modelId } : {}),
				...(effortId ? { effortId } : {}),
				...(modeId ? { modeId } : {}),
				...(fast ? { fast } : {}),
			};
			starts.push(this.started);
			return super.start(options);
		}

		startSelections(): Promise<ChatSelections> {
			const listed = (category: string, value: string | undefined) =>
				configOptions
					.find((option) => option.category === category)
					?.options.some((choice) => choice.id === value);
			const { modelId, effortId, modeId } = this.started;
			return Promise.resolve({
				...(listed("model", modelId) ? { modelId } : {}),
				...(listed("thought_level", effortId) ? { effortId } : {}),
				...(modeId && modeId !== AGENT_DEFAULT_MODE ? { modeId } : {}),
			});
		}

		setConfigOption(configId: string, value: string): Promise<boolean> {
			this.options = this.options.map((option) =>
				option.id === configId ? { ...option, currentValue: value } : option,
			);
			this.emit({ kind: "session", session: { configOptions: this.options } });
			if (!holdSettings) return Promise.resolve(true);
			return new Promise((resolve) => held.push(() => resolve(true)));
		}

		override setMode(modeId: string): Promise<boolean> {
			if (modeId === "refused") return Promise.resolve(false);
			return super.setMode(modeId);
		}
	}
	const harness = () =>
		new SelectableHarness({
			start: [
				{
					kind: "session",
					session: { status: "idle", modeId: "default", configOptions },
				},
			],
			turns: [
				[
					{ kind: "turn", turn: turn("t1") },
					{ kind: "item", item: agentMessage("a1", "done"), turnId: "t1" },
					{ kind: "turn", turn: turn("t1", { status: "completed" }) },
					{ kind: "session", session: { status: "idle" } },
				],
			],
		});
	const runtime = createTestRuntime({
		harnesses: new Map([
			[FAKE_HARNESS, harness],
			[OTHER_HARNESS, harness],
		]),
	});
	const create = (
		harness: string,
		extra: {
			modelId?: string;
			modeId?: string;
			replacesSessionId?: string;
			headless?: boolean;
			rememberSelections?: boolean;
			resumes?: boolean;
			fallbackModeId?: string;
		} = {},
	) =>
		runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "workspace-1",
			harness,
			cwd: "/tmp/workspace",
			...(extra.headless ? {} : { interactive: true }),
			...(extra.modelId ? { modelId: extra.modelId } : {}),
			...(extra.modeId ? { modeId: extra.modeId } : {}),
			...(extra.rememberSelections ? { rememberSelections: true } : {}),
			...(extra.fallbackModeId ? { fallbackModeId: extra.fallbackModeId } : {}),
			...(extra.resumes ? { resume: { harnessSessionId: "agent-1" } } : {}),
			...(extra.replacesSessionId
				? {
						resume: {
							harnessSessionId: "agent-1",
							replacesSessionId: extra.replacesSessionId,
						},
					}
				: {}),
		});
	const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
	const idle = (sessionId: string) =>
		waitFor(() => runtime.live.get(sessionId)?.state.status === "idle");
	const pick = async (sessionId: string) => {
		await idle(sessionId);
		await runtime.commands.setConfigOption({
			commandId: randomUUID(),
			sessionId,
			configId: "model",
			value: "deepseek-v4.1-flash",
			confirm: true,
		});
		await runtime.commands.setConfigOption({
			commandId: randomUUID(),
			sessionId,
			configId: "effort",
			value: "high",
			confirm: true,
		});
		runtime.commands.setMode({
			commandId: randomUUID(),
			sessionId,
			modeId: "acceptEdits",
		});
		runtime.commands.setMode({
			commandId: randomUUID(),
			sessionId,
			modeId: "plan",
		});
		runtime.commands.setMode({
			commandId: randomUUID(),
			sessionId,
			modeId: "refused",
		});
		await settled();
	};
	return { runtime, starts, create, idle, pick, settled, held, hold };
}

describe("chat selections", () => {
	test("a new chat starts on what was last picked for its agent, and an explicit pick still wins", async () => {
		const { runtime, starts, create, pick } = selectionRuntime();
		await pick(create(FAKE_HARNESS).sessionId);

		create(FAKE_HARNESS);
		create(FAKE_HARNESS, { modelId: "default" });
		create(OTHER_HARNESS);

		expect(starts.slice(1)).toEqual([
			{
				modelId: "deepseek-v4.1-flash",
				effortId: "high",
				modeId: "acceptEdits",
			},
			{ modelId: "default", effortId: "high", modeId: "acceptEdits" },
			{},
		]);
		await runtime.dispose();
	});

	test("fast mode is remembered by its option id, whether turned on or off", async () => {
		const { runtime, starts, create, idle } = selectionRuntime();
		const toggle = async (sessionId: string, value: string) => {
			await idle(sessionId);
			await runtime.commands.setConfigOption({
				commandId: randomUUID(),
				sessionId,
				configId: "fast",
				value,
				confirm: true,
			});
		};
		await toggle(create(FAKE_HARNESS).sessionId, "on");
		await toggle(create(FAKE_HARNESS).sessionId, "off");
		create(FAKE_HARNESS);

		expect(starts.slice(1)).toEqual([{ fast: "on" }, { fast: "off" }]);
		await runtime.dispose();
	});

	test("a chat nobody opened takes the remembered model and effort, but not the mode", async () => {
		const { runtime, starts, create, pick } = selectionRuntime();
		await pick(create(FAKE_HARNESS).sessionId);

		create(FAKE_HARNESS, { headless: true });

		expect(starts[1]).toEqual({
			modelId: "deepseek-v4.1-flash",
			effortId: "high",
		});
		await runtime.dispose();
	});

	test("picks a chat is opened with are remembered once the agent takes them, when the client says they are the user's own", async () => {
		const { runtime, starts, create, settled } = selectionRuntime();

		create(OTHER_HARNESS, {
			modelId: "deepseek-v4.1-flash",
			modeId: "acceptEdits",
			rememberSelections: true,
		});
		await settled();
		create(OTHER_HARNESS, { modelId: "not-offered", rememberSelections: true });
		create(OTHER_HARNESS, {
			modeId: AGENT_DEFAULT_MODE,
			rememberSelections: true,
		});
		create(OTHER_HARNESS, { modelId: "default" });
		await settled();
		create(OTHER_HARNESS);

		expect(starts[4]).toEqual({
			modelId: "deepseek-v4.1-flash",
			modeId: "acceptEdits",
		});
		await runtime.dispose();
	});

	test("a replacement resumes on the model, effort, mode and fast mode of the chat it replaces", async () => {
		const { runtime, starts, create, idle, pick } = selectionRuntime();
		const source = create(OTHER_HARNESS, { modelId: "default" });
		await pick(source.sessionId);
		await waitFor(
			() => runtime.live.get(source.sessionId)?.state.modeId === "plan",
		);
		await runtime.commands.closeSession({ sessionId: source.sessionId });

		const replaced = create(OTHER_HARNESS, {
			replacesSessionId: source.sessionId,
		});
		await idle(replaced.sessionId);

		expect(starts[1]).toEqual({
			modelId: "deepseek-v4.1-flash",
			effortId: "high",
			modeId: "plan",
			fast: "off",
		});
		await runtime.dispose();
	});

	test("a chat a person resumes from outside a journal starts in the remembered mode, before any fallback", async () => {
		const { runtime, starts, create, pick } = selectionRuntime();
		await pick(create(FAKE_HARNESS).sessionId);

		create(FAKE_HARNESS, {
			resumes: true,
			fallbackModeId: "bypassPermissions",
		});
		create(OTHER_HARNESS, {
			resumes: true,
			fallbackModeId: "bypassPermissions",
		});

		expect(starts.slice(1)).toEqual([
			{ modeId: "acceptEdits" },
			{ modeId: "bypassPermissions" },
		]);
		await runtime.dispose();
	});

	test("a setting that settles after a newer one is not remembered over it", async () => {
		const { runtime, starts, create, idle, settled, held, hold } =
			selectionRuntime();
		const source = create(OTHER_HARNESS);
		await idle(source.sessionId);
		hold(true);
		for (const value of ["deepseek-v4.1-flash", "default"]) {
			void runtime.commands.setConfigOption({
				commandId: randomUUID(),
				sessionId: source.sessionId,
				configId: "model",
				value,
			});
		}
		hold(false);
		held[1]?.();
		await settled();
		held[0]?.();
		await settled();

		create(OTHER_HARNESS);

		expect(starts[1]).toEqual({ modelId: "default" });
		await runtime.dispose();
	});

	test("a rewind of a stopped chat starts on that chat's model, effort, mode and fast mode", async () => {
		const { runtime, starts, create, pick } = selectionRuntime();
		const source = create(OTHER_HARNESS, { headless: true });
		await pick(source.sessionId);
		runtime.commands.prompt({
			commandId: randomUUID(),
			sessionId: source.sessionId,
			clientId: "client-1",
			content: [{ type: "text", text: "hello" }],
		});
		await waitFor(
			() => runtime.sessions.get(source.sessionId)?.status === "idle",
		);
		const outline = runtime.commands.getOutline({
			sessionId: source.sessionId,
		});
		const asked = outline.ok
			? outline.outline.items.find(({ item }) => item.kind === "user_message")
			: undefined;
		await runtime.commands.closeSession({ sessionId: source.sessionId });

		await runtime.commands.rewindSession({
			commandId: randomUUID(),
			sessionId: source.sessionId,
			itemId: asked?.item.id ?? "",
			prompt: "hello again",
			cwd: "/tmp/workspace",
		});

		expect(starts.at(-1)).toEqual({
			modelId: "deepseek-v4.1-flash",
			effortId: "high",
			modeId: "plan",
			fast: "off",
		});
		await runtime.dispose();
	});
});
