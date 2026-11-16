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
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";

interface NewDevDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Resolves to its 1:1's id, or null when it was not made. */
	onCreate: (dev: {
		name: string;
		description: string;
	}) => Promise<string | null>;
	onCreated: (chatId: string) => void;
}

export function NewDevDialog({
	open,
	onOpenChange,
	onCreate,
	onCreated,
}: NewDevDialogProps) {
	const { t } = useLingui();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [isCreating, setCreating] = useState(false);
	const ready = name.trim() !== "" && description.trim() !== "";
	const create = async () => {
		if (!ready || isCreating) return;
		setCreating(true);
		const chatId = await onCreate({
			name: name.trim(),
			description: description.trim(),
		});
		setCreating(false);
		if (!chatId) return;
		setName("");
		setDescription("");
		onOpenChange(false);
		onCreated(chatId);
	};
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>New Dev</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>Give it a name and say what it is for.</Trans>
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
						value={name}
						maxLength={60}
						placeholder={t({ message: "Name" })}
						onChange={(event) => setName(event.target.value)}
					/>
					<Textarea
						value={description}
						maxLength={2000}
						rows={4}
						placeholder={t({
							message: "What it does, and how you want it to work",
						})}
						onChange={(event) => setDescription(event.target.value)}
					/>
					<Button type="submit" disabled={!ready || isCreating}>
						<Trans>Create a Dev</Trans>
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
