import type { PaneRegistry, RendererContext } from "@superset/panes";
import { WaitsForWorkspace } from "../../components/WaitsForWorkspace";

/** Panes that read the box itself, so they have nothing to show before it answers. */
export const PANES_NEEDING_THE_BOX = [
	"file",
	"diff",
	"terminal",
	"files",
	"changes-list",
	"review",
	"mobile",
] as const;

/** The registry with each of `kinds` waiting for a cloud box to answer first. */
export function waitForWorkspace<TData>(
	registry: PaneRegistry<TData>,
	kinds: readonly string[] = PANES_NEEDING_THE_BOX,
): PaneRegistry<TData> {
	const next: PaneRegistry<TData> = { ...registry };
	for (const kind of kinds) {
		const definition = registry[kind];
		if (!definition) continue;
		next[kind] = {
			...definition,
			renderPane: (ctx: RendererContext<TData>) => (
				<WaitsForWorkspace>{definition.renderPane(ctx)}</WaitsForWorkspace>
			),
		};
	}
	return next;
}
