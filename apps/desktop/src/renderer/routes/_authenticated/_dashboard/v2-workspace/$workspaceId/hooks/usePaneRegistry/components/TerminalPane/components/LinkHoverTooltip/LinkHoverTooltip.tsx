import type { ExternalApp } from "@superset/local-db";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getAppOption } from "renderer/components/OpenInExternalDropdown/constants";
import type { LinkHoverInfo } from "renderer/lib/terminal/terminal-runtime-registry";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { HoveredLink } from "../../hooks/useLinkHoverState";

const TOOLTIP_OFFSET_PX = 14;

interface LinkHoverTooltipProps {
	hoveredLink: HoveredLink | null;
}

function getAppLabel(app: ExternalApp): string {
	const option = getAppOption(app);
	return option?.displayLabel ?? option?.label ?? "external editor";
}

function getLabel(
	info: LinkHoverInfo,
	shift: boolean,
	defaultEditor: ExternalApp | null,
): string {
	if (info.kind === "url") {
		return shift ? "Open in external browser" : "Open in browser";
	}
	if (shift) {
		return defaultEditor
			? `Open in ${getAppLabel(defaultEditor)}`
			: "Open externally";
	}
	return info.isDirectory ? "Reveal in sidebar" : "Open in editor";
}

export function LinkHoverTooltip({ hoveredLink }: LinkHoverTooltipProps) {
	const [defaultEditor, setDefaultEditor] = useState<ExternalApp | null>(null);

	useEffect(() => {
		let cancelled = false;
		electronTrpcClient.settings.getDefaultEditor
			.query()
			.then((editor) => {
				if (!cancelled) setDefaultEditor(editor);
			})
			.catch((error) => {
				if (cancelled) return;
				console.warn(
					"[LinkHoverTooltip] Failed to fetch default editor:",
					error,
				);
				setDefaultEditor(null);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (!hoveredLink || !hoveredLink.modifier) return null;

	const label = getLabel(hoveredLink.info, hoveredLink.shift, defaultEditor);

	return createPortal(
		<div
			className="pointer-events-none fixed z-50 w-fit rounded-md bg-foreground px-3 py-1.5 text-xs text-background"
			style={{
				left: hoveredLink.clientX + TOOLTIP_OFFSET_PX,
				top: hoveredLink.clientY + TOOLTIP_OFFSET_PX,
			}}
		>
			{label}
		</div>,
		document.body,
	);
}
