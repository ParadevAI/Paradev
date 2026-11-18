import type { ReactNode } from "react";
import type { PageActions } from "../../../../hooks/usePageActions";

export interface PageRowMenuProps {
	/** Null while the viewer's rights on the page are unknown. */
	actions: PageActions | null;
	onShare: () => void;
	children: ReactNode;
}
