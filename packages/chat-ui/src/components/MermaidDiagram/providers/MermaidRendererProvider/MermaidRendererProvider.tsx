import { createContext, type ReactNode, useContext } from "react";
import type { MermaidRenderer } from "../../types";
import { renderMermaid } from "../../utils/renderMermaid";

const MermaidRendererContext = createContext<MermaidRenderer>(renderMermaid);

/** Swaps the renderer, so a test or a story draws without loading Mermaid. */
export function MermaidRendererProvider({
	children,
	renderer,
}: {
	renderer: MermaidRenderer;
	children: ReactNode;
}) {
	return (
		<MermaidRendererContext.Provider value={renderer}>
			{children}
		</MermaidRendererContext.Provider>
	);
}

export const useMermaidRenderer = () => useContext(MermaidRendererContext);
