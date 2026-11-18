import type { CreatePaneInput } from "@superset/panes";
import { NEW_TAB_PANE_KIND, type PaneViewerData } from "../../types";

export const NEW_TAB_PANE: CreatePaneInput<PaneViewerData> = {
	kind: NEW_TAB_PANE_KIND,
	data: { kind: NEW_TAB_PANE_KIND },
};
