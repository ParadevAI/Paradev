import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { type FormEvent, type KeyboardEvent, useId, useState } from "react";

export interface LinkDraft {
	text: string;
	url: string;
	/** True when editing a link that is already there, which can then be removed. */
	existing: boolean;
}

interface LinkEditorProps {
	initial: LinkDraft;
	onSave: (text: string, url: string) => void;
	onRemove: () => void;
	onCancel: () => void;
}

function withScheme(url: string): string {
	return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
}

/** Slack's link dialog as a panel above the composer: the words, then where they go. */
export function LinkEditor({
	initial,
	onSave,
	onRemove,
	onCancel,
}: LinkEditorProps) {
	const { t } = useLingui();
	const [text, setText] = useState(initial.text);
	const [url, setUrl] = useState(initial.url);
	const textId = useId();
	const titleId = useId();
	const urlId = useId();
	const trimmed = url.trim();

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!trimmed) return;
		onSave(text.trim() || trimmed, withScheme(trimmed));
	};
	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key !== "Escape") return;
		event.preventDefault();
		event.stopPropagation();
		onCancel();
	};

	return (
		<form
			role="dialog"
			aria-labelledby={titleId}
			onSubmit={submit}
			onKeyDown={onKeyDown}
			className="absolute right-0 bottom-full left-0 z-20 mb-1.5 flex flex-col gap-2.5 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
		>
			<span id={titleId} className="text-[13px] font-semibold">
				{initial.existing ? <Trans>Edit link</Trans> : <Trans>Add link</Trans>}
			</span>
			<label htmlFor={textId} className="flex flex-col gap-1 text-xs">
				<span className="text-muted-foreground">
					<Trans>Text</Trans>
				</span>
				<Input
					id={textId}
					value={text}
					onChange={(event) => setText(event.target.value)}
					className="h-8 text-[13px]"
				/>
			</label>
			<label htmlFor={urlId} className="flex flex-col gap-1 text-xs">
				<span className="text-muted-foreground">
					<Trans>Link</Trans>
				</span>
				<Input
					id={urlId}
					value={url}
					autoFocus
					placeholder={t({ message: "Paste or type a link" })}
					onChange={(event) => setUrl(event.target.value)}
					className="h-8 text-[13px]"
				/>
			</label>
			<div className="flex items-center gap-2">
				{initial.existing && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onRemove}
						className="text-destructive hover:text-destructive"
					>
						<Trans>Remove link</Trans>
					</Button>
				)}
				<span className="flex-1" />
				<Button type="button" variant="ghost" size="sm" onClick={onCancel}>
					<Trans>Cancel</Trans>
				</Button>
				<Button type="submit" size="sm" disabled={!trimmed}>
					<Trans>Save</Trans>
				</Button>
			</div>
		</form>
	);
}
