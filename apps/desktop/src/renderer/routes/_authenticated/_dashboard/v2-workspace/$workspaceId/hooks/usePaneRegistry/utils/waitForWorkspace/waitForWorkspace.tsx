import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { PaneRegistry, RendererContext } from "@superset/panes";
import { WaitsForWorkspace } from "../../components/WaitsForWorkspace";

/** Panes that read the box itself, and what each says until it answers. */
export const PANES_NEEDING_THE_BOX: Record<string, MessageDescriptor> = {
	file: msg({ message: "File opens when the workspace wakes up" }),
	diff: msg({ message: "Diff opens when the workspace wakes up" }),
	terminal: msg({ message: "Terminal starts when the workspace wakes up" }),
	files: msg({ message: "Files load when the workspace wakes up" }),
	"changes-list": msg({ message: "Changes load when the workspace wakes up" }),
	review: msg({ message: "Review loads when the workspace wakes up" }),
	mobile: msg({ message: "Simulator starts when the workspace wakes up" }),
};

/** The registry with each of `waiting` waiting for a cloud box to answer first. */
export function waitForWorkspace<TData>(
	registry: PaneRegistry<TData>,
	waiting: Record<string, MessageDescriptor> = PANES_NEEDING_THE_BOX,
): PaneRegistry<TData> {
	const next: PaneRegistry<TData> = { ...registry };
	for (const [kind, message] of Object.entries(waiting)) {
		const definition = registry[kind];
		if (!definition) continue;
		next[kind] = {
			...definition,
			renderPane: (ctx: RendererContext<TData>) => (
				<WaitsForWorkspace message={message}>
					{definition.renderPane(ctx)}
				</WaitsForWorkspace>
			),
		};
	}
	return next;
}
