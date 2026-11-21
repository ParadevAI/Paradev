import { createContext, type ReactNode, useContext } from "react";
import type { ComposerChip } from "../../types";

type RenderChip = (chip: ComposerChip, rendered: ReactNode) => ReactNode | null;

const ChipRenderContext = createContext<RenderChip | undefined>(undefined);

export function ChipRenderProvider({
	children,
	renderChip,
}: {
	children: ReactNode;
	renderChip: RenderChip | undefined;
}) {
	return (
		<ChipRenderContext.Provider value={renderChip}>
			{children}
		</ChipRenderContext.Provider>
	);
}

export function useRenderChip(): RenderChip | undefined {
	return useContext(ChipRenderContext);
}
