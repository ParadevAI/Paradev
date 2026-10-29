import { createContext, type ReactNode, useContext } from "react";
import type { LayoutNode } from "../../../types";

export const PaneAsideRenderContext = createContext<
	(() => ReactNode) | undefined
>(undefined);

export const PaneAsideTargetContext = createContext<string | null>(null);

export function topRightPaneId(
	node: LayoutNode | null | undefined,
): string | null {
	if (!node) return null;
	if (node.type === "pane") return node.paneId;
	return topRightPaneId(
		node.direction === "horizontal" ? node.second : node.first,
	);
}

export function usePaneAside(paneId: string): ReactNode {
	const render = useContext(PaneAsideRenderContext);
	const target = useContext(PaneAsideTargetContext);
	return render && target === paneId ? render() : null;
}
