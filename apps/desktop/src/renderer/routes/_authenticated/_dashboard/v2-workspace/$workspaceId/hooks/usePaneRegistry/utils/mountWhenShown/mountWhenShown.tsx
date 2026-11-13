import type { PaneRegistry, RendererContext } from "@superset/panes";
import {
	PENDING_CLOUD_CHAT_PANE_KIND,
	SUBAGENT_PANE_KIND,
} from "../../../../types";
import { MountWhenShown } from "../../components/MountWhenShown";

/** Panes that start a shell, an agent, a guest page or a poll when mounted. */
export const PANES_STARTING_WORK = [
	"terminal",
	"chat-v3",
	PENDING_CLOUD_CHAT_PANE_KIND,
	"browser",
	"desktop",
	"mobile",
	SUBAGENT_PANE_KIND,
	"page",
] as const;

/** The registry with each of `kinds` held back in a workspace that was
 *  mounted ahead of time and not opened yet. */
export function mountWhenShown<TData>(
	registry: PaneRegistry<TData>,
	kinds: readonly string[] = PANES_STARTING_WORK,
): PaneRegistry<TData> {
	const next: PaneRegistry<TData> = { ...registry };
	for (const kind of kinds) {
		const definition = registry[kind];
		if (!definition) continue;
		const { renderHeaderExtras, renderToolbar } = definition;
		next[kind] = {
			...definition,
			renderPane: (ctx: RendererContext<TData>) => (
				<MountWhenShown>{definition.renderPane(ctx)}</MountWhenShown>
			),
			...(renderHeaderExtras && {
				renderHeaderExtras: (ctx: RendererContext<TData>) => (
					<MountWhenShown>{renderHeaderExtras(ctx)}</MountWhenShown>
				),
			}),
			...(renderToolbar && {
				renderToolbar: (ctx: RendererContext<TData>) => (
					<MountWhenShown>{renderToolbar(ctx)}</MountWhenShown>
				),
			}),
		};
	}
	return next;
}
