import type { ReactNode } from "react";
import {
	TabVisibilityContext,
	useIsTabVisible,
} from "../../../../../../hooks/useIsTabVisible";

interface TabVisibilityScopeProps {
	visible: boolean;
	children: ReactNode;
}

export function TabVisibilityScope({
	visible,
	children,
}: TabVisibilityScopeProps) {
	const isParentVisible = useIsTabVisible();
	return (
		<TabVisibilityContext.Provider value={visible && isParentVisible}>
			{children}
		</TabVisibilityContext.Provider>
	);
}
