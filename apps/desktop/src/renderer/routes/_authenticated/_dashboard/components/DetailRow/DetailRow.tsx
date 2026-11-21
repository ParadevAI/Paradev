import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { type ReactNode, useState } from "react";

interface DetailRowProps {
	label: ReactNode;
	value: ReactNode;
	/** The text to edit; absent rows are read-only. */
	editValue?: string;
	maxLength?: number;
	onSave?: (value: string) => void;
	/** Edit goes somewhere else instead of editing in place. */
	onEdit?: () => void;
}

/** One line of a details dialog: a label, its value, and Edit on the right. */
export function DetailRow({
	label,
	value,
	editValue,
	maxLength,
	onSave,
	onEdit,
}: DetailRowProps) {
	const [draft, setDraft] = useState<string | null>(null);
	const canEdit = onEdit !== undefined || onSave !== undefined;
	return (
		<div className="flex flex-col gap-1 px-4 py-3">
			<div className="flex items-center justify-between gap-4">
				<span className="text-sm font-semibold">{label}</span>
				{canEdit && draft === null && (
					<Button
						size="xs"
						variant="ghost"
						onClick={() => (onEdit ? onEdit() : setDraft(editValue ?? ""))}
						className="-mr-2 text-muted-foreground"
					>
						<Trans>Edit</Trans>
					</Button>
				)}
			</div>
			{draft === null ? (
				<div className="text-sm">{value}</div>
			) : (
				<form
					className="flex items-center gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						onSave?.(draft);
						setDraft(null);
					}}
				>
					<Input
						autoFocus
						value={draft}
						maxLength={maxLength}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.stopPropagation();
								setDraft(null);
							}
						}}
						className="h-8"
					/>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => setDraft(null)}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button type="submit" size="sm">
						<Trans>Save</Trans>
					</Button>
				</form>
			)}
		</div>
	);
}
