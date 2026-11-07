import { Trans } from "@lingui/react/macro";
import { normalizeChannelName } from "@superset/shared/channels";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import { useEffect, useState } from "react";
import { ChannelNameInput } from "renderer/routes/_authenticated/_dashboard/components/ChannelNameInput";

interface RenameChannelDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	name: string;
	onRename: (name: string) => void;
}

export function RenameChannelDialog({
	open,
	onOpenChange,
	name,
	onRename,
}: RenameChannelDialogProps) {
	const [draft, setDraft] = useState(name);
	const normalized = normalizeChannelName(draft);
	useEffect(() => {
		if (open) setDraft(name);
	}, [open, name]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="text-xl">
						<Trans>Rename this channel</Trans>
					</DialogTitle>
				</DialogHeader>
				<form
					className="flex flex-col gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (!normalized) return;
						if (normalized !== name) onRename(normalized);
						onOpenChange(false);
					}}
				>
					<Label htmlFor="rename-channel-name">
						<Trans>Channel name</Trans>
					</Label>
					<ChannelNameInput
						id="rename-channel-name"
						value={draft}
						onChange={setDraft}
					/>
					<div className="mt-6 flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button type="submit" disabled={!normalized}>
							<Trans>Save Changes</Trans>
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
