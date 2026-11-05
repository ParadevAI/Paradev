import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";

export function UserMessageEditor({
	initialText,
	onCancel,
	onSubmit,
}: {
	initialText: string;
	onCancel: () => void;
	onSubmit: (text: string) => void;
}) {
	const [text, setText] = useState(initialText);
	const submit = () => {
		if (text.trim()) onSubmit(text);
	};
	return (
		<div className="ml-auto flex w-full max-w-[min(100%,36rem)] flex-col gap-2">
			<Textarea
				autoFocus
				className="max-h-80 rounded-xl bg-foreground/10 font-sans text-sm"
				onChange={(event) => setText(event.target.value)}
				onFocus={(event) =>
					event.currentTarget.setSelectionRange(
						event.currentTarget.value.length,
						event.currentTarget.value.length,
					)
				}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onCancel();
					} else if (
						event.key === "Enter" &&
						!event.shiftKey &&
						!event.nativeEvent.isComposing
					) {
						event.preventDefault();
						submit();
					}
				}}
				value={text}
			/>
			<div className="flex items-center justify-end gap-2">
				<span className="mr-auto text-muted-foreground text-xs">
					<Trans>Later messages are removed.</Trans>
				</span>
				<Button onClick={onCancel} size="sm" variant="ghost">
					<Trans>Cancel</Trans>
				</Button>
				<Button disabled={!text.trim()} onClick={submit} size="sm">
					<Trans>Send</Trans>
				</Button>
			</div>
		</div>
	);
}
