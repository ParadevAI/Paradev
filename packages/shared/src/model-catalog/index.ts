export type ModelMetadata = {
	provider: string;
	family?: string;
	toolCall?: boolean;
	reasoning?: boolean;
	inputModalities?: string[];
	outputModalities?: string[];
	contextWindow?: number;
	outputLimit?: number;
	status?: string;
};

export type CatalogModel = {
	id: string;
	label: string;
	description?: string;
	group?: string;
	metadata?: ModelMetadata;
};

export type AgentModelCatalog = {
	models: CatalogModel[];
	source: "runtime" | "cli" | "bundled";
	availability: "reported" | "unknown";
	fetchedAt: number;
	stale: boolean;
	failure?: "unsupported" | "timeout" | "busy" | "failed";
};

export type ModelFilters = {
	query?: string;
	providers?: readonly string[];
	hiddenIds?: readonly string[];
	requireTools?: boolean;
	requireTextOutput?: boolean;
	includeDeprecated?: boolean;
	selectedId?: string;
};

export function filterModelCatalog(
	models: readonly CatalogModel[],
	filters: ModelFilters = {},
): CatalogModel[] {
	const query = filters.query?.trim().toLowerCase();
	return models.filter((model) => {
		if (model.id === filters.selectedId) return true;
		if (filters.hiddenIds?.includes(model.id)) return false;
		const metadata = model.metadata;
		if (
			filters.providers?.length &&
			(!metadata || !filters.providers.includes(metadata.provider))
		)
			return false;
		if (filters.requireTools && metadata?.toolCall === false) return false;
		if (
			filters.requireTextOutput &&
			metadata?.outputModalities &&
			!metadata.outputModalities.includes("text")
		)
			return false;
		if (
			filters.includeDeprecated === false &&
			metadata?.status === "deprecated"
		)
			return false;
		return (
			!query ||
			`${model.id} ${model.label} ${metadata?.provider ?? ""}`
				.toLowerCase()
				.includes(query)
		);
	});
}

export function uniqueModels(models: readonly CatalogModel[]): CatalogModel[] {
	const seen = new Set<string>();
	return models.filter((model) => {
		if (
			!model.id ||
			Array.from(model.id).some(
				(char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
			) ||
			seen.has(model.id)
		)
			return false;
		seen.add(model.id);
		return true;
	});
}
