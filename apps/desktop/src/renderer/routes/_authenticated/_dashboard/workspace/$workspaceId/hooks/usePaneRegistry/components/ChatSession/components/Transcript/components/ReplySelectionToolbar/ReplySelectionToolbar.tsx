import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { type RefObject, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import {
	type Box,
	selectionToolbarLayout,
} from "../../utils/selectionToolbarLayout";

const ACTION_CLASSNAME = "rounded-none px-2.5 font-normal";
const COPIED_MS = 900;

export function ReplySelectionToolbar({
	ref,
	anchor,
	bounds,
	text,
	onAddToChat,
	onCopied,
}: {
	ref: RefObject<HTMLDivElement | null>;
	anchor: Box;
	bounds: Box;
	text: string;
	onAddToChat: () => void;
	onCopied: () => void;
}) {
	const { t } = useLingui();
	const { copied, copyToClipboard } = useCopyToClipboard();
	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(onCopied, COPIED_MS);
		return () => clearTimeout(timer);
	}, [copied, onCopied]);
	const [position, setPosition] = useState<{
		left: number;
		top: number;
	} | null>(null);
	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const { width, height } = element.getBoundingClientRect();
		const { left, top } = selectionToolbarLayout({
			anchor,
			size: { width, height },
			bounds,
		});
		setPosition({ left, top });
	}, [ref, anchor, bounds]);

	return createPortal(
		<div
			aria-label={t({ message: "Selection actions" })}
			className="fade-in-0 fixed z-50 flex animate-in items-stretch divide-x divide-border overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md duration-150"
			onMouseDown={(event) => event.preventDefault()}
			ref={ref}
			role="toolbar"
			style={{
				left: position?.left ?? 0,
				top: position?.top ?? 0,
				visibility: position ? "visible" : "hidden",
			}}
		>
			<Button
				className={ACTION_CLASSNAME}
				onClick={onAddToChat}
				size="xs"
				variant="ghost"
			>
				<Trans>Add to chat</Trans>
			</Button>
			<Button
				className={ACTION_CLASSNAME}
				onClick={() => {
					copyToClipboard(text).catch((error: unknown) => {
						console.error("[chat] copy failed", error);
					});
				}}
				size="xs"
				variant="ghost"
			>
				{copied ? <Trans>Copied</Trans> : <Trans>Copy</Trans>}
			</Button>
		</div>,
		document.body,
	);
}
