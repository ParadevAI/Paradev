import type { ReactNode } from "react";

export function PaneTiles({ children }: { children: ReactNode }) {
	return <div className="grid grid-cols-2 gap-2">{children}</div>;
}
