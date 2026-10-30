import {
	CodexRpcClient,
	type CodexTransport,
	type CodexTransportHandlers,
	spawnCodexTransport,
} from "@superset/chat-runtime";
import {
	type AgentModelCatalog,
	getAgentModelSupport,
} from "@superset/shared/agent-models";
import { z } from "zod";

const modelListSchema = z.looseObject({
	data: z.array(
		z.looseObject({
			id: z.string().min(1),
			displayName: z.string().optional(),
			hidden: z.boolean().optional(),
			supportedReasoningEfforts: z
				.array(z.looseObject({ reasoningEffort: z.string().min(1) }))
				.optional(),
		}),
	),
	nextCursor: z.string().nullish(),
});

const MAX_PAGES = 10;

export interface DiscoverCodexModelsOptions {
	command: string;
	env: NodeJS.ProcessEnv;
	timeoutMs: number;
	createTransport?: (handlers: CodexTransportHandlers) => CodexTransport;
}

/**
 * The models Codex's own picker offers this account: `codex app-server` →
 * `model/list`, minus hidden entries. Curated labels win over Codex's display
 * names, which mix "GPT-6-Sol" and "GPT-6.1 Terra" spellings.
 */
export async function discoverCodexModels(
	options: DiscoverCodexModelsOptions,
): Promise<AgentModelCatalog> {
	const client = new CodexRpcClient({
		createTransport:
			options.createTransport ??
			((handlers) =>
				spawnCodexTransport(
					{ command: options.command, env: options.env },
					handlers,
				)),
		onNotification: () => {},
		onServerRequest: (request) =>
			client.respondWithError(request.id, "not supported while listing models"),
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error("codex model/list timed out")),
			options.timeoutMs,
		);
	});
	try {
		return await Promise.race([listModels(client), timeout]);
	} finally {
		clearTimeout(timer);
		await client.close();
	}
}

async function listModels(client: CodexRpcClient): Promise<AgentModelCatalog> {
	await client.initialize();
	const curated = getAgentModelSupport("codex")?.models ?? [];
	const models: AgentModelCatalog["models"] = [];
	const efforts: Record<string, string[]> = {};
	let cursor: string | null | undefined;
	for (let page = 0; page < MAX_PAGES; page++) {
		const result = modelListSchema.parse(
			await client.request("model/list", cursor ? { cursor } : {}),
		);
		for (const model of result.data) {
			if (model.hidden) continue;
			const label =
				curated.find((option) => option.id === model.id)?.label ??
				model.displayName ??
				model.id;
			models.push({ id: model.id, label });
			if (model.supportedReasoningEfforts) {
				efforts[model.id] = model.supportedReasoningEfforts.map(
					(effort) => effort.reasoningEffort,
				);
			}
		}
		cursor = result.nextCursor;
		if (!cursor) break;
	}
	return { models, efforts };
}
