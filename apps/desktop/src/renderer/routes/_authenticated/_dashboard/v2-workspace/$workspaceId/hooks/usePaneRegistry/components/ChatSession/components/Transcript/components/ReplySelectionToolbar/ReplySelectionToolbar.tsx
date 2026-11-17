import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { type RefObject, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
	type Box,
	selectionToolbarLayout,
} from "../../utils/selectionToolbarLayout";

const ACTION_CLASSNAME = "rounded-none px-2.5 font-normal";

export function ReplySelectionToolbar({
	ref,
	anchor,
	bounds,
	onAddToChat,
	onAddToNewChat,
}: {
	ref: RefObject<HTMLDivElement | null>;
	anchor: Box;
	bounds: Box;
	onAddToChat: () => void;
	onAddToNewChat?: (() => void) | undefined;
}) {
	const { t } = useLingui();
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
			{onAddToNewChat && (
				<Button
					className={ACTION_CLASSNAME}
					onClick={onAddToNewChat}
					size="xs"
					variant="ghost"
				>
					<Trans>Add to new chat</Trans>
				</Button>
			)}
		</div>,
		document.body,
	);
}
