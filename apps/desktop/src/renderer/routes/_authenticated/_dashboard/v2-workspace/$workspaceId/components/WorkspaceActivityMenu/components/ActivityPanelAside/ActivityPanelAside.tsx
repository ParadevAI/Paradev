import { useLingui } from "@lingui/react/macro";
import { useIsTabVisible } from "@superset/panes";
import { cn } from "@superset/ui/utils";
import { useCallback, useLayoutEffect, useState } from "react";
import {
	CENTERED_CONTENT_WIDTH_PX,
	PANEL_CONTENT_GAP_PX,
	PANEL_EDGE_GAP_PX,
	PANEL_TOP_GAP_PX,
	PANEL_WIDTH_PX,
} from "../../constants";
import { useActivityPanelStore } from "../../stores/activityPanelStore";

const INSET_PX = PANEL_WIDTH_PX + PANEL_EDGE_GAP_PX + PANEL_CONTENT_GAP_PX;

export function ActivityPanelAside({ workspaceId }: { workspaceId: string }) {
	const { t } = useLingui();
	const isTabVisible = useIsTabVisible();
	const setAsideNode = useActivityPanelStore((state) => state.setAsideNode);
	const clearAsideNode = useActivityPanelStore((state) => state.clearAsideNode);
	const setFits = useActivityPanelStore((state) => state.setFits);
	const [sentinel, setSentinel] = useState<HTMLElement | null>(null);
	const [hasRoom, setHasRoom] = useState(false);
	const setAnchorNode = useActivityPanelStore((state) => state.setAnchorNode);
	const clearAnchorNode = useActivityPanelStore(
		(state) => state.clearAnchorNode,
	);
	const hidden = useActivityPanelStore(
		(state) => state.hidden[workspaceId] === true,
	);
	const fits = hasRoom && isTabVisible;
	const shown = fits && !hidden;

	useLayoutEffect(() => {
		const host = sentinel?.parentElement;
		if (!host) return;
		const measure = () =>
			setHasRoom(host.clientWidth >= CENTERED_CONTENT_WIDTH_PX + 2 * INSET_PX);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(host);
		return () => observer.disconnect();
	}, [sentinel]);

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

	const attachAnchor = useCallback(
		(node: HTMLElement) => {
			setAnchorNode(workspaceId, node);
			return () => clearAnchorNode(workspaceId, node);
		},
		[workspaceId, setAnchorNode, clearAnchorNode],
	);

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
			{isTabVisible && (
				<span
					aria-hidden
					className="pointer-events-none invisible absolute h-0"
					ref={attachAnchor}
					style={{
						top: PANEL_TOP_GAP_PX,
						right: PANEL_EDGE_GAP_PX,
						width: PANEL_WIDTH_PX,
					}}
				/>
			)}
			{isTabVisible && (
				<aside
					aria-label={t({ message: "Workspace activity" })}
					aria-hidden={!shown}
					inert={!shown}
					className={cn(
						"pointer-events-none absolute inset-y-0 z-10 flex min-h-0 origin-top-right flex-col py-2 transition-[opacity,translate,scale,visibility] will-change-[opacity,translate,scale] motion-reduce:transition-none",
						shown
							? "visible translate-y-0 scale-100 opacity-100 duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)]"
							: "invisible -translate-y-1 scale-[0.98] opacity-0 duration-150 ease-[cubic-bezier(0.4,0,1,1)]",
					)}
					ref={attach}
					style={{ right: PANEL_EDGE_GAP_PX, width: PANEL_WIDTH_PX }}
				/>
			)}
		</>
	);
}
