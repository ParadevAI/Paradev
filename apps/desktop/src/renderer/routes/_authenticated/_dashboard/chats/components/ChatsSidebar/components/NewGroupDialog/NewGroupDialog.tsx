import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { useState } from "react";

interface NewGroupDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Resolves to the new chat's id, or null when it was not made. */
	onCreate: (title: string) => Promise<string | null>;
	onCreated: (chatId: string) => void;
}

export function NewGroupDialog({
	open,
	onOpenChange,
	onCreate,
	onCreated,
}: NewGroupDialogProps) {
	const { t } = useLingui();
	const [title, setTitle] = useState("");
	const [isCreating, setCreating] = useState(false);
	const name = title.trim();
	const create = async () => {
		if (!name || isCreating) return;
		setCreating(true);
		const chatId = await onCreate(name);
		setCreating(false);
		if (!chatId) return;
		setTitle("");
		onOpenChange(false);
		onCreated(chatId);
	};
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>
						<Trans>New group</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>A group comes with a Dev of its own.</Trans>
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						void create();
					}}
				>
					<Input
						autoFocus
						value={title}
						maxLength={60}
						placeholder={t({ message: "Group name" })}
						onChange={(event) => setTitle(event.target.value)}
					/>
					<Button type="submit" disabled={!name || isCreating}>
						<Trans>Create group</Trans>
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
