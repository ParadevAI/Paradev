import type {
	CatalogModel,
	ModelMetadata,
} from "@superset/shared/agent-models";
import { z } from "zod";

const modelSchema = z.object({
	id: z.string(),
	family: z.string().optional(),
	tool_call: z.boolean().optional(),
	reasoning: z.boolean().optional(),
	modalities: z
		.object({ input: z.array(z.string()), output: z.array(z.string()) })
		.optional(),
	limit: z
		.object({ context: z.number().optional(), output: z.number().optional() })
		.optional(),
	status: z.string().optional(),
});
const catalogSchema = z.record(
	z.string(),
	z.object({ models: z.record(z.string(), z.unknown()) }),
);

export function parseModelMetadata(raw: unknown): Map<string, ModelMetadata> {
	const catalog = catalogSchema.parse(raw);
	const result = new Map<string, ModelMetadata>();
	for (const [provider, entry] of Object.entries(catalog)) {
		for (const value of Object.values(entry.models)) {
			const parsed = modelSchema.safeParse(value);
			if (!parsed.success) continue;
			const model = parsed.data;
			result.set(`${provider}/${model.id}`, {
				provider,
				family: model.family,
				toolCall: model.tool_call,
				reasoning: model.reasoning,
				inputModalities: model.modalities?.input,
				outputModalities: model.modalities?.output,
				contextWindow: model.limit?.context,
				outputLimit: model.limit?.output,
				status: model.status,
			});
		}
	}
	return result;
}

let metadata = new Map<string, ModelMetadata>();
let nextRefresh = 0;
let pending: Promise<void> | undefined;

function refresh(): void {
	if (pending || Date.now() < nextRefresh) return;
	nextRefresh = Date.now() + 60_000;
	pending = (async () => {
		const response = await fetch("https://models.dev/api.json", {
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) throw new Error("Model metadata unavailable");
		const body = await response.text();
		if (body.length > 16 * 1024 * 1024)
			throw new Error("Model metadata too large");
		metadata = parseModelMetadata(JSON.parse(body));
		nextRefresh = Date.now() + 24 * 60 * 60_000;
	})()
		.catch(() => undefined)
		.finally(() => {
			pending = undefined;
		});
}

export function enrichModels(
	models: CatalogModel[],
	presetId: string,
): CatalogModel[] {
	refresh();
	const provider =
		presetId === "claude"
			? "anthropic"
			: presetId === "codex"
				? "openai"
				: presetId === "gemini"
					? "google"
					: undefined;
	return models.map((model) => {
		const key = model.id.includes("/")
			? model.id
			: provider
				? `${provider}/${model.id}`
				: undefined;
		const found = key ? metadata.get(key) : undefined;
		return found ? { ...model, metadata: found } : model;
	});
}
