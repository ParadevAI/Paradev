import { Trans } from "@lingui/react/macro";
import {
	PASTED_TEXT_ACTION_CLASS,
	PastedTextCard,
} from "@superset/chat-ui/PastedTextCard";
import { useId, useState } from "react";

export function PastedTextBlock({ text }: { text: string }) {
	const [open, setOpen] = useState(false);
	const preId = useId();
	return (
		<div className="flex w-full max-w-[min(100%,36rem)] flex-col items-end gap-1.5">
			<PastedTextCard
				text={text}
				sourceText={open ? "" : text}
				action={
					<button
						type="button"
						aria-controls={preId}
						aria-expanded={open}
						className={PASTED_TEXT_ACTION_CLASS}
						onClick={() => setOpen((value) => !value)}
					>
						{open ? <Trans>Hide text</Trans> : <Trans>Show text</Trans>}
					</button>
				}
			/>
			{open && (
				<pre
					className="max-h-80 w-full overflow-auto rounded-lg border-[0.5px] border-border bg-foreground/[0.03] px-3 py-2 font-mono text-foreground text-xs leading-relaxed"
					id={preId}
				>
					{text}
				</pre>
			)}
		</div>
	);
}
