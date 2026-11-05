"use client";

import { Trans } from "@lingui/react/macro";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import type { RefObject } from "react";

export type DictationBarProps = {
	canvasRef: RefObject<HTMLCanvasElement | null>;
	seconds: number;
	status: "recording" | "transcribing";
};

function formatElapsed(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function DictationBar({
	canvasRef,
	seconds,
	status,
}: DictationBarProps) {
	const transcribing = status === "transcribing";
	return (
		<div className="flex min-w-0 flex-1 items-center gap-3 pl-1">
			{transcribing ? (
				<Spinner aria-hidden className="size-3.5 text-muted-foreground" />
			) : (
				<span
					aria-hidden
					className="size-2 shrink-0 rounded-full bg-destructive motion-safe:animate-pulse"
				/>
			)}
			<canvas
				ref={canvasRef}
				className={cn(
					"h-7 min-w-0 flex-1 text-muted-foreground transition-opacity",
					transcribing && "opacity-40",
				)}
			/>
			<span className="shrink-0 text-sm text-muted-foreground tabular-nums">
				{transcribing ? <Trans>Transcribing…</Trans> : formatElapsed(seconds)}
			</span>
			<span className="sr-only" aria-live="polite">
				{transcribing ? <Trans>Transcribing</Trans> : <Trans>Recording</Trans>}
			</span>
		</div>
	);
}
