import type { MouseEvent } from "react";
import { appUrl } from "@/lib/app-url";
import type { RowLinkComponent } from "./RowLink.types";

const opensElsewhere = (event: MouseEvent) =>
	event.button !== 0 ||
	event.metaKey ||
	event.ctrlKey ||
	event.shiftKey ||
	event.altKey;

/**
 * A real link around the row, so ⌘-click, middle-click and Copy Link Address
 * work. A plain click stays in the app: the anchor's own navigation is
 * cancelled and the row's press handler runs.
 */
export const RowLink: RowLinkComponent = ({ href, children }) => (
	<a
		href={appUrl(href)}
		style={{ display: "contents", color: "inherit", textDecoration: "none" }}
		onClickCapture={(event) => {
			if (opensElsewhere(event)) event.stopPropagation();
			else event.preventDefault();
		}}
	>
		{children}
	</a>
);
