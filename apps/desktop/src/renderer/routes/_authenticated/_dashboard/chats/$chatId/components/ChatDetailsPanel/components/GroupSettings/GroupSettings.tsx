import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useState } from "react";

interface GroupSettingsProps {
	title: string;
	onRename: (title: string) => void;
	/** Resolves to whether the group is gone. */
	onDelete: () => Promise<boolean>;
}

/** What a group's owner may do to it: rename it, or delete it for everyone. */
export function GroupSettings({
	title,
	onRename,
	onDelete,
}: GroupSettingsProps) {
	const { t } = useLingui();
	const [name, setName] = useState(title);
	const [isConfirming, setConfirming] = useState(false);
	const [isDeleting, setDeleting] = useState(false);
	const renamed = name.trim();
	return (
		<section className="flex flex-col gap-2">
			<h3 className="px-1 text-xs font-medium text-muted-foreground">
				<Trans>Group</Trans>
			</h3>
			<form
				className="flex gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (renamed && renamed !== title) onRename(renamed);
				}}
			>
				<Input
					value={name}
					maxLength={60}
					aria-label={t({ message: "Group name" })}
					onChange={(event) => setName(event.target.value)}
				/>
				<Button
					type="submit"
					variant="outline"
					disabled={!renamed || renamed === title}
				>
					<Trans>Rename</Trans>
				</Button>
			</form>
			{isConfirming ? (
				<div className="flex flex-col gap-2 rounded-lg border border-border p-3">
					<p className="text-sm text-muted-foreground">
						<Trans>
							This deletes the group and its messages for everyone in it. It
							cannot be undone.
						</Trans>
					</p>
					<div className="flex justify-end gap-2">
						<Button
							size="sm"
							variant="ghost"
							disabled={isDeleting}
							onClick={() => setConfirming(false)}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							size="sm"
							variant="destructive"
							disabled={isDeleting}
							onClick={() => {
								setDeleting(true);
								void onDelete().finally(() => setDeleting(false));
							}}
						>
							<Trans>Delete</Trans>
						</Button>
					</div>
				</div>
			) : (
				<Button
					variant="ghost"
					className="justify-start text-destructive hover:text-destructive"
					onClick={() => setConfirming(true)}
				>
					<Trans>Delete group</Trans>
				</Button>
			)}
		</section>
	);
}
