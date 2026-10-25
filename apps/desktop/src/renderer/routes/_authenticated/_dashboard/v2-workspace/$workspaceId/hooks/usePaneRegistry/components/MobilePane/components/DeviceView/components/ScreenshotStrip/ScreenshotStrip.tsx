import { Trans } from "@lingui/react/macro";
import type { SelectScreenshot } from "@superset/local-db";
import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import { ScreenshotThumb } from "../ScreenshotThumb";

const VISIBLE_SHOTS = 3;
const HIDE_AFTER_MS = 5000;

interface ScreenshotStripProps {
	shots: SelectScreenshot[];
	workspaceId: string;
	lastCapturedAt: number;
	onShowAll: () => void;
}

export function ScreenshotStrip({
	shots,
	workspaceId,
	lastCapturedAt,
	onShowAll,
}: ScreenshotStripProps) {
	const [shown, setShown] = useState(false);
	useEffect(() => {
		if (!lastCapturedAt) return;
		setShown(true);
		const timer = setTimeout(() => setShown(false), HIDE_AFTER_MS);
		return () => clearTimeout(timer);
	}, [lastCapturedAt]);

	if (shots.length === 0) return null;
	const hiddenCount = shots.length - VISIBLE_SHOTS;
	return (
		<div
			className={cn(
				"absolute right-3 bottom-3 z-10 flex gap-1.5 rounded-lg border bg-popover/90 p-1.5 shadow-md backdrop-blur transition-[opacity,visibility] duration-500",
				shown ? "visible opacity-100" : "invisible opacity-0",
			)}
		>
			{shots.slice(0, VISIBLE_SHOTS).map((shot) => (
				<ScreenshotThumb
					key={shot.id}
					shot={shot}
					workspaceId={workspaceId}
					className="h-24 w-11 shrink-0"
				/>
			))}
			{hiddenCount > 0 && (
				<button
					type="button"
					onClick={onShowAll}
					className="flex h-24 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs text-muted-foreground hover:text-foreground"
				>
					<Trans>+{hiddenCount}</Trans>
				</button>
			)}
		</div>
	);
}
