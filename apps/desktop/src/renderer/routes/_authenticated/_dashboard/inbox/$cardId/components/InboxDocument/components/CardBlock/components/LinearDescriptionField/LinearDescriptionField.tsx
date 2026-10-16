import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import { LinearMarkdown } from "../LinearMarkdown";

interface LinearDescriptionFieldProps {
	/** Markdown, as Linear stores it. */
	value: string;
	onChange: (next: string) => void;
	/** The team's mention handles, for the rendered text. */
	handles: string[];
	disabled?: boolean;
	/** What the field is called; "Description" when absent. */
	label?: string;
	/** Drawn in place of the rendered text while it is not being edited, as a diff is. */
	shown?: ReactNode;
}

/** An issue's description: rendered as Linear renders it, and its markdown source when the reader edits it. */
export function LinearDescriptionField({
	value,
	onChange,
	handles,
	disabled,
	label,
	shown,
}: LinearDescriptionFieldProps) {
	const { t } = useLingui();
	const name = label ?? t({ message: "Description" });
	const [editing, setEditing] = useState(false);
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				{name}
				<button
					type="button"
					disabled={disabled}
					onClick={() => setEditing((on) => !on)}
					className="rounded px-1.5 py-0.5 font-medium text-foreground hover:bg-fill-hover"
				>
					{editing ? (
						<Trans context="finish editing the description">Done</Trans>
					) : (
						<Trans>Edit</Trans>
					)}
				</button>
			</div>
			{editing ? (
				<textarea
					value={value}
					onChange={(event) => onChange(event.target.value)}
					disabled={disabled}
					aria-label={name}
					rows={Math.min(Math.max(value.split("\n").length + 1, 4), 16)}
					className="resize-y rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-foreground/40"
				/>
			) : (
				(shown ?? (value && <LinearMarkdown text={value} handles={handles} />))
			)}
		</div>
	);
}
