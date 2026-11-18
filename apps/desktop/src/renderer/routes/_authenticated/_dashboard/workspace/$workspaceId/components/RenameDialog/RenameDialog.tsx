import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { useState } from "react";

interface RenameDialogProps {
	/** The current name, or "" when it has never been named. */
	name: string;
	title: string;
	description: string;
	inputLabel: string;
	onClose: () => void;
	onSubmit: (name: string) => void;
}

/**
 * Sets a name, or clears it by submitting nothing.
 *
 * Mounted only while it is open, so each target it opens on starts from that
 * target's name with no copying back and forth.
 */
export function RenameDialog({
	name,
	title,
	description,
	inputLabel,
	onClose,
	onSubmit,
}: RenameDialogProps) {
	const [value, setValue] = useState(name);

	const handleSubmit = () => {
		onClose();
		if (value.trim() === name.trim()) return;
		onSubmit(value);
	};

	return (
		<Dialog
			modal
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="max-w-[360px]">
				<DialogHeader>
					<DialogTitle className="font-medium">{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						handleSubmit();
					}}
				>
					<Input
						autoFocus
						value={value}
						onChange={(event) => setValue(event.target.value)}
						onFocus={(event) => event.target.select()}
						aria-label={inputLabel}
						className="h-8 text-sm"
					/>
					<DialogFooter className="flex-row justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={onClose}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button type="submit" size="sm" className="h-7 px-3 text-xs">
							<Trans>Save</Trans>
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
