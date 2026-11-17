import { Trans } from "@lingui/react/macro";
import { PASTED_TEXT_ACTION_CLASS } from "@superset/chat-ui/PastedTextCard";
import { cn } from "@superset/ui/utils";
import { useId, useLayoutEffect, useRef, useState } from "react";

export function QuotedReplyBlock({ text }: { text: string }) {
	const textRef = useRef<HTMLParagraphElement>(null);
	const [open, setOpen] = useState(false);
	const [clipped, setClipped] = useState(false);
	const textId = useId();
	useLayoutEffect(() => {
		const element = textRef.current;
		if (!element || open) return;
		const measure = () =>
			setClipped(element.scrollHeight > element.clientHeight + 1);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [open]);
	return (
		<div
			className="flex max-w-[min(100%,36rem)] flex-col items-start gap-1 border-border border-l-2 pl-3"
			data-quoted-reply
		>
			<p
				className={cn(
					"whitespace-pre-wrap break-words font-sans text-muted-foreground text-sm",
					!open && "line-clamp-4",
				)}
				id={textId}
				ref={textRef}
			>
				{text}
			</p>
			{(clipped || open) && (
				<button
					aria-controls={textId}
					aria-expanded={open}
					className={cn(
						PASTED_TEXT_ACTION_CLASS,
						"text-muted-foreground text-xs",
					)}
					onClick={() => setOpen((value) => !value)}
					type="button"
				>
					{open ? <Trans>Show less</Trans> : <Trans>Show more</Trans>}
				</button>
			)}
		</div>
	);
}
