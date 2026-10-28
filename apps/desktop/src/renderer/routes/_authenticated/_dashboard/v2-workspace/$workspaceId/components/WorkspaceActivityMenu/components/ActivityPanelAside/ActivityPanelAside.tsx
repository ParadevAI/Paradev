import { useLingui } from "@lingui/react/macro";
import { useIsTabVisible } from "@superset/panes";
import { useCallback, useLayoutEffect, useState } from "react";
import {
	MIN_CONTENT_WIDTH_PX,
	PANEL_CONTENT_GAP_PX,
	PANEL_EDGE_GAP_PX,
	PANEL_WIDTH_PX,
} from "../../constants";
import { useActivityPanelStore } from "../../stores/activityPanelStore";

const INSET_PX = PANEL_WIDTH_PX + PANEL_EDGE_GAP_PX + PANEL_CONTENT_GAP_PX;

export function ActivityPanelAside({ workspaceId }: { workspaceId: string }) {
	const pinned = useActivityPanelStore(
		(state) => state.pinned[workspaceId] === true,
	);
	const { t } = useLingui();
	const isTabVisible = useIsTabVisible();
	const setAsideNode = useActivityPanelStore((state) => state.setAsideNode);
	const clearAsideNode = useActivityPanelStore((state) => state.clearAsideNode);
	const setFits = useActivityPanelStore((state) => state.setFits);
	const [sentinel, setSentinel] = useState<HTMLElement | null>(null);
	const [hasRoom, setHasRoom] = useState(false);
	const shown = pinned && hasRoom && isTabVisible;

	useLayoutEffect(() => {
		const host = sentinel?.parentElement;
		if (!host) return;
		const measure = () =>
			setHasRoom(host.clientWidth >= PANEL_WIDTH_PX + MIN_CONTENT_WIDTH_PX);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(host);
		return () => observer.disconnect();
	}, [sentinel]);

	const fits = hasRoom && isTabVisible;
	useLayoutEffect(() => {
		setFits(workspaceId, fits);
		return () => setFits(workspaceId, false);
	}, [workspaceId, fits, setFits]);

	useLayoutEffect(() => {
		const host = sentinel?.parentElement;
		if (!host || !shown) return;
		host.style.setProperty("--pane-aside-inset", `${INSET_PX}px`);
		return () => {
			host.style.removeProperty("--pane-aside-inset");
		};
	}, [sentinel, shown]);

	const attach = useCallback(
		(node: HTMLElement) => {
			setAsideNode(workspaceId, node);
			return () => clearAsideNode(workspaceId, node);
		},
		[workspaceId, setAsideNode, clearAsideNode],
	);

	return (
		<>
			<span aria-hidden className="hidden" ref={setSentinel} />
			{shown && (
				<aside
					aria-label={t({ message: "Workspace activity" })}
					className="pointer-events-none absolute inset-y-0 z-10 flex min-h-0 flex-col py-2"
					ref={attach}
					style={{ right: PANEL_EDGE_GAP_PX, width: PANEL_WIDTH_PX }}
				/>
			)}
		</>
	);
}
