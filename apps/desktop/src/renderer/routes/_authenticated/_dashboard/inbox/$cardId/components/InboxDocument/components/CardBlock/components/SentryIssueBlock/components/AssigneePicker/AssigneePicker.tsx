import { useLingui } from "@lingui/react/macro";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuCircleUserRound } from "react-icons/lu";
import type { SentryPersonView } from "../../../../types";
import { LetterAvatar } from "../../../LetterAvatar";
import { PickerList } from "../../../PickerList";

interface AssigneePickerProps {
	assignee: SentryPersonView | null;
	members: SentryPersonView[];
	disabled?: boolean;
	/** Null takes the issue from whoever has it. */
	onPick: (id: string | null) => void;
}

const face = (person: SentryPersonView) => (
	<LetterAvatar
		address={{ name: person.name, email: person.email ?? person.id }}
		className="size-4 text-[9px]"
	/>
);

/** Who has the issue, as a chip that opens the organization's members. */
export function AssigneePicker({
	assignee,
	members,
	disabled,
	onPick,
}: AssigneePickerProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const unassigned = t({ message: "Unassigned" });
	const icon = <LuCircleUserRound className="size-3.5 shrink-0" />;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					aria-label={t({ message: "Assignee" })}
					className={cn(
						"inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground outline-none",
						"enabled:hover:bg-fill-hover focus-visible:border-foreground/40 disabled:cursor-default",
						!assignee && "text-muted-foreground",
					)}
				>
					{assignee ? face(assignee) : icon}
					<span className="truncate">{assignee?.name ?? unassigned}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-0">
				<PickerList
					placeholder={t({ message: "Assign to…" })}
					multi={false}
					rows={[
						{ id: "", label: unassigned, icon, checked: assignee === null },
						...members.map((member) => ({
							id: member.id,
							label: member.name,
							icon: face(member),
							detail: member.email ?? undefined,
							checked: assignee?.id === member.id,
						})),
					]}
					onPick={(id) => {
						setOpen(false);
						onPick(id || null);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
