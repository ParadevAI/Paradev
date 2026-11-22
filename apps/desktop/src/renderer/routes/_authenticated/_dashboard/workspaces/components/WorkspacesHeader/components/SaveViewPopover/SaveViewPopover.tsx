import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { type ReactNode, useState } from "react";

interface SaveViewPopoverProps {
	trigger: ReactNode;
	onSave: (name: string) => void;
}

/** Names a new view before it is saved; empty submits fall back to a default name. */
export function SaveViewPopover({ trigger, onSave }: SaveViewPopoverProps) {
	const { t } = useLingui();
	const [isOpen, setIsOpen] = useState(false);
	const [name, setName] = useState("");

	const submit = () => {
		onSave(name);
		setName("");
		setIsOpen(false);
	};

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent align="end" className="w-64 p-3">
				<form
					className="flex flex-col gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					<label
						htmlFor="v2-workspaces-view-name"
						className="text-xs font-medium text-muted-foreground"
					>
						<Trans>View name</Trans>
					</label>
					<Input
						id="v2-workspaces-view-name"
						autoFocus
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder={t({ message: "e.g. My cloud reviews" })}
						className="h-8"
					/>
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setIsOpen(false)}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button type="submit" size="sm">
							<Trans>Save view</Trans>
						</Button>
					</div>
				</form>
			</PopoverContent>
		</Popover>
	);
}
