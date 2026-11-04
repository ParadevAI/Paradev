export {
	resolveTabTitle,
	useTabTitle,
	Workspace,
} from "./components/Workspace";
export { TabVisibilityContext, useIsTabVisible } from "./hooks/useIsTabVisible";
export { usePaneAppearance } from "./hooks/usePaneAppearance";
export { usePaneFocus } from "./hooks/usePaneFocus";
export type {
	ContextMenuActionConfig,
	PaneActionConfig,
	PaneAppearance,
	PaneContext,
	PaneDefinition,
	PaneRegistry,
	PaneTitleSource,
	RendererContext,
	TabContext,
	WorkspaceInteractionState,
	WorkspaceProps,
} from "./types";
