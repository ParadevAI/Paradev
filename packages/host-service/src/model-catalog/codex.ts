import {
	AcpRpcClient,
	type SpawnAcpOptions,
	spawnAcpTransport,
} from "@superset/chat-runtime/acp-client";
import type { CatalogModel } from "@superset/shared/agent-models";
import { z } from "zod";
import { abortable } from "./discovery";

const pageSchema = z.object({
	data: z.array(
		z.object({
			id: z.string(),
			model: z.string(),
			displayName: z.string(),
			hidden: z.boolean().optional(),
		}),
	),
	nextCursor: z.string().nullish(),
});

export async function discoverCodexModels(
	launch: SpawnAcpOptions,
	signal = AbortSignal.timeout(20_000),
): Promise<CatalogModel[]> {
	const client = new AcpRpcClient({
		createTransport: (handlers) =>
			spawnAcpTransport({ ...launch, args: ["app-server"] }, handlers),
		onNotification: () => {},
		onServerRequest: (request) =>
			client.respondWithError(
				request.id,
				-32601,
				"Model discovery does not handle requests",
			),
	});
	try {
		await abortable(
			client.request(
				"initialize",
				{
					clientInfo: { name: "paradev-model-discovery", version: "1.0.0" },
					capabilities: {},
				},
				10_000,
			),
			signal,
		);
		client.notify("initialized", {});
		const models: CatalogModel[] = [];
		let cursor: string | undefined;
		const cursors = new Set<string>();
		do {
			const page = pageSchema.parse(
				await abortable(
					client.request(
						"model/list",
						{ cursor, limit: 100, includeHidden: false },
						10_000,
					),
					signal,
				),
			);
			models.push(
				...page.data
					.filter((model) => !model.hidden)
					.map((model) => ({ id: model.model, label: model.displayName })),
			);
			cursor = page.nextCursor ?? undefined;
			if (cursor && cursors.has(cursor))
				throw new Error("Repeated model cursor");
			if (cursor) cursors.add(cursor);
			if (cursors.size > 100) throw new Error("Model catalog is too large");
		} while (cursor);
		return models;
	} finally {
		await client.close();
	}
}
