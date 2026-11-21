import type { ReactElement } from "react";

export interface RowLinkProps {
	/** The app path the row opens, without route groups: `/workspace/<id>`. */
	href: string;
	/** The row; its own press handler still does the in-app navigation. */
	children: ReactElement;
}

export type RowLinkComponent = (props: RowLinkProps) => ReactElement;
