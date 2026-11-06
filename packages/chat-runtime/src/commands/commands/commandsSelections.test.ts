import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ChatSelections } from "@superset/chat/core";
import {
	AGENT_DEFAULT_MODE,
	type SessionConfigOption,
} from "@superset/chat/protocol";
import type { HarnessStartOptions } from "../../harness";
import { FakeHarness } from "../../harness/fake";
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
];

function selectionRuntime() {
	const starts: ChatSelections[] = [];
	class SelectableHarness extends FakeHarness {
		private options = configOptions;

		override start(options: HarnessStartOptions) {
			const { modelId, effortId, modeId } = options;
			starts.push({
				...(modelId ? { modelId } : {}),
				...(effortId ? { effortId } : {}),
				...(modeId ? { modeId } : {}),
			});
			return super.start(options);
		}

		setConfigOption(configId: string, value: string): Promise<boolean> {
			this.options = this.options.map((option) =>
				option.id === configId ? { ...option, currentValue: value } : option,
			);
			this.emit({ kind: "session", session: { configOptions: this.options } });
			return Promise.resolve(true);
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
			turns: [],
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
	return { runtime, starts, create, idle, pick };
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

	test("picks a chat is opened with are remembered when the client says they are the user's own", async () => {
		const { runtime, starts, create } = selectionRuntime();

		create(OTHER_HARNESS, {
			modelId: "deepseek-v4.1-flash",
			modeId: "acceptEdits",
			rememberSelections: true,
		});
		create(OTHER_HARNESS, {
			modeId: AGENT_DEFAULT_MODE,
			rememberSelections: true,
		});
		create(OTHER_HARNESS, { modelId: "default" });
		create(OTHER_HARNESS);

		expect(starts[3]).toEqual({
			modelId: "deepseek-v4.1-flash",
			modeId: "acceptEdits",
		});
		await runtime.dispose();
	});

	test("a replacement resumes on the model, effort and mode of the chat it replaces", async () => {
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
		});
		await runtime.dispose();
	});
});
