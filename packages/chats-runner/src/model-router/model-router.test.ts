import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type Api,
	type AssistantMessage,
	type ClassifierResult,
	type FauxResponseStep,
	fauxAssistantMessage,
	fauxProvider,
	type Model,
} from "@earendil-works/pi-ai";
import {
	createAgentSession,
	type ModelRouteRequest,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
	type RouterTiers,
	routerModel,
	routerTiersFromEnv,
	type Tier,
	unknownModels,
} from "./model-router.ts";

const root = mkdtempSync(join(tmpdir(), "model-router-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("routerTiersFromEnv", () => {
	test("reads comma-separated ids per tier, trimmed, keeping the defaults for unset or empty tiers", () => {
		const tiers = routerTiersFromEnv({
			DEV_MODELS_FAST: " a/one , b/two,, ",
			DEV_MODELS_STRONG: "",
		});
		expect(tiers.fast).toEqual(["a/one", "b/two"]);
		expect(tiers.medium).toEqual(["anthropic/claude-sonnet-5.5"]);
		expect(tiers.strong).toEqual(["anthropic/claude-opus-5.5"]);
	});

	test("unknownModels lists each id the catalog doesn't know, once", () => {
		const tiers: RouterTiers = {
			fast: ["ok", "typo"],
			medium: ["typo"],
			strong: ["ok"],
		};
		expect(unknownModels(tiers, (id) => id === "ok")).toEqual(["typo"]);
	});
});

const TIERS: RouterTiers = {
	fast: ["fast-1", "fast-2"],
	medium: ["medium-1"],
	strong: ["strong-1"],
};

describe("dev/auto's thinking", () => {
	const known = (id: string) => ({ id }) as unknown as Model<Api>;
	const auto = routerModel({ tiers: TIERS, model: known, classify: null });
	const request = (reason: ModelRouteRequest<never>["reason"]) =>
		({
			reason,
			thinkingLevel: "off",
			messages: [],
		}) as unknown as ModelRouteRequest<never>;

	test("a turn thinks even in a session recorded with thinking off: without it, models answer in final text instead of calling `reply`", async () => {
		expect(auto.thinkingLevels).toEqual(["medium"]);
		expect((await auto.route(request("user"))).thinkingLevel).toBe("medium");
	});

	test("a request outside a turn (a compaction summary) keeps its level", async () => {
		expect((await auto.route(request("direct"))).thinkingLevel).toBe("off");
	});
});

/** Jev's answer: `tier` with probability `p`. */
const jev = (tier: Tier, p: number): ClassifierResult => ({
	api: "typesafe-system-one",
	provider: "test",
	model: "jev",
	answers: {
		work: {
			type: "choice",
			choice: tier,
			probabilities: { [tier]: p },
			confidence: p,
		},
	},
	stopReason: "stop",
	timestamp: 0,
});

/**
 * A real pi session on `dev/auto` over scripted models: each answer says which model gave it, and `fail` lists the
 * models that answer with a retryable error instead.
 */
async function autoSession(
	classify: () => Promise<ClassifierResult>,
	fail: string[] = [],
) {
	const runtime = await ModelRuntime.create({
		authPath: join(root, "auth.json"),
		modelsPath: null,
		refreshOnCreate: false,
	});
	const faux = fauxProvider({
		models: ["fast-1", "fast-2", "medium-1", "strong-1"].map((id) => ({ id })),
	});
	const step: FauxResponseStep = (_context, _options, _state, model) => {
		faux.appendResponses([step]);
		if (fail.includes(model.id))
			return fauxAssistantMessage("", {
				stopReason: "error",
				errorMessage: "529 overloaded",
			});
		return fauxAssistantMessage(`answered by ${model.id}`);
	};
	faux.setResponses([step]);
	runtime.registerNativeProvider(faux.provider);
	runtime.registerVirtualModel(
		routerModel({ tiers: TIERS, model: (id) => faux.getModel(id), classify }),
	);
	const { session } = await createAgentSession({
		cwd: root,
		agentDir: root,
		model: runtime.getModel("dev", "auto")!,
		modelRuntime: runtime,
		settingsManager: SettingsManager.inMemory({
			retry: { enabled: true, maxRetries: 2, baseDelayMs: 1 },
		}),
		sessionManager: SessionManager.inMemory(root),
		tools: [],
	});
	// A virtual model only routes to a provider pi has checked for credentials; for the faux one that check runs in the
	// background, and building the session starts it over.
	while (!runtime.hasConfiguredAuth(faux.provider.id)) await Bun.sleep(1);
	const answer = async (text: string) => {
		await session.prompt(text);
		const last = session.messages.findLast(
			(m): m is AssistantMessage => m.role === "assistant",
		)!;
		return last.stopReason === "error"
			? `error: ${last.errorMessage}`
			: last.model;
	};
	return { session, answer };
}

describe("dev/auto", () => {
	test("routes a turn to the first model of the tier Jev picks", async () => {
		const { answer } = await autoSession(async () => jev("strong", 0.9));
		expect(await answer("build me an app")).toBe("strong-1");
	});

	test("stays on the chat's tier unless Jev is sure of another one", async () => {
		const answers = [jev("fast", 0.6), jev("strong", 0.6), jev("strong", 0.8)];
		const { answer } = await autoSession(async () => answers.shift()!);
		expect(await answer("hi")).toBe("fast-1");
		expect(await answer("maybe more work")).toBe("fast-1");
		expect(await answer("build me an app")).toBe("strong-1");
	});

	test("a turn goes on when Jev fails: on the chat's tier, or medium for a new chat", async () => {
		const answers: (() => Promise<ClassifierResult>)[] = [
			() => Promise.reject(new Error("down")),
			async () => jev("fast", 0.9),
			() => Promise.reject(new Error("down")),
		];
		const { answer } = await autoSession(() => answers.shift()!());
		expect(await answer("first")).toBe("medium-1");
		expect(await answer("hi")).toBe("fast-1");
		expect(await answer("again")).toBe("fast-1");
	});

	test("a failed model falls back to the tier's next one", async () => {
		const { answer } = await autoSession(
			async () => jev("fast", 0.9),
			["fast-1"],
		);
		expect(await answer("hi")).toBe("fast-2");
	});

	test("when the tier has no model left the turn fails with the model's error", async () => {
		const { answer } = await autoSession(
			async () => jev("medium", 0.9),
			["medium-1"],
		);
		expect(await answer("hi")).toBe("error: 529 overloaded");
	});

	test("rejects a tier naming a model the catalog doesn't know", () => {
		expect(() =>
			routerModel({
				tiers: { ...TIERS, fast: ["nope"] },
				model: () => undefined,
				classify: null,
			}),
		).toThrow("Unknown gateway model nope");
	});
});
