import { Trans, useLingui } from "@lingui/react/macro";
import { CHANNEL_DESCRIPTION_MAX_LENGTH } from "@superset/shared/channels";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Textarea } from "@superset/ui/textarea";
import { useEffect, useState } from "react";

interface EditDescriptionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	description: string | null;
	onSave: (description: string | null) => void;
}

export function EditDescriptionDialog({
	open,
	onOpenChange,
	description,
	onSave,
}: EditDescriptionDialogProps) {
	const { t } = useLingui();
	const [draft, setDraft] = useState(description ?? "");
	useEffect(() => {
		if (open) setDraft(description ?? "");
	}, [open, description]);

	const save = () => {
		const next = draft.trim();
		if (next !== (description ?? "")) onSave(next || null);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="text-xl">
						<Trans>Edit description</Trans>
					</DialogTitle>
				</DialogHeader>
				<form
					className="flex flex-col gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						save();
					}}
				>
					<div className="relative">
						<Textarea
							autoFocus
							value={draft}
							maxLength={CHANNEL_DESCRIPTION_MAX_LENGTH}
							placeholder={t({ message: "Add a description" })}
							onChange={(event) => setDraft(event.target.value)}
							onFocus={(event) => {
								const end = event.currentTarget.value.length;
								event.currentTarget.setSelectionRange(end, end);
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									save();
								}
							}}
							className="min-h-24 resize-none pr-12"
						/>
						<span className="absolute right-3 bottom-2 text-xs text-muted-foreground tabular-nums">
							{CHANNEL_DESCRIPTION_MAX_LENGTH - draft.length}
						</span>
					</div>
					<div className="mt-4 flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button type="submit">
							<Trans>Save</Trans>
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
