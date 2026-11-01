import {
	CodexRpcClient,
	type CodexTransport,
	type CodexTransportHandlers,
	spawnCodexTransport,
} from "@superset/chat-runtime";
import type { AgentModelCatalog } from "@superset/shared/agent-models";
import { z } from "zod";

const modelListSchema = z.looseObject({
	data: z.array(
		z.looseObject({
			id: z.string().min(1),
			model: z.string().min(1),
			isDefault: z.boolean(),
			defaultReasoningEffort: z.string(),
			displayName: z.string(),
			hidden: z.boolean(),
			supportedReasoningEfforts: z.array(
				z.looseObject({ reasoningEffort: z.string().min(1) }),
			),
		}),
	),
	nextCursor: z.string().nullish(),
});

export interface DiscoverCodexModelsOptions {
	command: string;
	env: NodeJS.ProcessEnv;
	timeoutMs: number;
	createTransport?: (handlers: CodexTransportHandlers) => CodexTransport;
}

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
	const models: AgentModelCatalog["models"] = [];
	const efforts: Record<string, string[]> = {};
	const seenCursors = new Set<string>();
	let cursor: string | null | undefined;
	while (true) {
		const result = modelListSchema.parse(
			await client.request("model/list", { cursor, includeHidden: true }),
		);
		for (const model of result.data) {
			models.push({
				id: model.model,
				label: model.displayName,
				hidden: model.hidden,
				isDefault: model.isDefault,
				defaultReasoningEffort: model.defaultReasoningEffort,
			});
			efforts[model.model] = model.supportedReasoningEfforts.map(
				(effort) => effort.reasoningEffort,
			);
		}
		cursor = result.nextCursor;
		if (!cursor) return { models, efforts };
		if (seenCursors.has(cursor))
			throw new Error("Repeated Codex model/list cursor");
		seenCursors.add(cursor);
	}
}
