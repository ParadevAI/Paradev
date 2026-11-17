import { Trans, useLingui } from "@lingui/react/macro";
import type { Dev } from "@superset/chats-core";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Switch } from "@superset/ui/switch";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";

interface EditDevDialogProps {
	dev: Dev;
	onOpenChange: (open: boolean) => void;
	/** Resolves to whether it saved. */
	onSave: (patch: {
		name: string;
		description: string;
		paradevAccess?: boolean;
	}) => Promise<boolean>;
	/** Absent when this Dev cannot be deleted. Resolves to whether it is gone. */
	onDelete?: () => Promise<boolean>;
}

export function EditDevDialog({
	dev,
	onOpenChange,
	onSave,
	onDelete,
}: EditDevDialogProps) {
	const { t } = useLingui();
	const [name, setName] = useState(dev.name);
	const [description, setDescription] = useState(dev.descriptionText ?? "");
	const [paradevAccess, setParadevAccess] = useState(
		dev.paradevAccess ?? false,
	);
	const [isBusy, setBusy] = useState(false);
	const [isConfirmingDelete, setConfirmingDelete] = useState(false);
	const ready =
		name.trim() !== "" &&
		(description.trim() !== "" || dev.kind === "personal");
	const run = async (work: () => Promise<boolean>) => {
		if (isBusy) return;
		setBusy(true);
		const done = await work();
		setBusy(false);
		if (done) onOpenChange(false);
	};
	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>Edit Dev</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>Give it a name and say what it is for.</Trans>
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						if (!ready) return;
						void run(() =>
							onSave({
								name: name.trim(),
								description: description.trim(),
								...(dev.paradevAccess !== undefined ? { paradevAccess } : {}),
							}),
						);
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
					{dev.paradevAccess !== undefined && (
						<div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
							<span className="flex flex-col gap-1">
								<label
									htmlFor="dev-paradev-access"
									className="text-sm font-medium"
								>
									<Trans>Let it act in Paradev as you</Trans>
								</label>
								<span className="text-xs text-muted-foreground">
									<Trans>
										It can start workspaces and coding agents with your access,
										also when someone else asks it in a group.
									</Trans>
								</span>
							</span>
							<Switch
								id="dev-paradev-access"
								checked={paradevAccess}
								onCheckedChange={setParadevAccess}
							/>
						</div>
					)}
					<Button type="submit" disabled={!ready || isBusy}>
						<Trans>Save</Trans>
					</Button>
					{onDelete && !isConfirmingDelete && (
						<Button
							type="button"
							variant="ghost"
							className="text-destructive hover:text-destructive"
							disabled={isBusy}
							onClick={() => setConfirmingDelete(true)}
						>
							<Trans>Delete Dev</Trans>
						</Button>
					)}
					{onDelete && isConfirmingDelete && (
						<div className="flex flex-col gap-2 rounded-lg border border-border p-3">
							<p className="text-sm text-muted-foreground">
								<Trans>
									This deletes the Dev and your chat with it, and takes it out
									of every group. It cannot be undone.
								</Trans>
							</p>
							<div className="flex justify-end gap-2">
								<Button
									type="button"
									size="sm"
									variant="ghost"
									disabled={isBusy}
									onClick={() => setConfirmingDelete(false)}
								>
									<Trans>Cancel</Trans>
								</Button>
								<Button
									type="button"
									size="sm"
									variant="destructive"
									disabled={isBusy}
									onClick={() => void run(onDelete)}
								>
									<Trans>Delete</Trans>
								</Button>
							</div>
						</div>
					)}
				</form>
			</DialogContent>
		</Dialog>
	);
}
