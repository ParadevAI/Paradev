import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@superset/ui/atoms/Avatar";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { LuUserPlus } from "react-icons/lu";
import type { ChannelPerson } from "../../../ChannelMessageRow";

interface AddPeoplePickerProps {
	people: ChannelPerson[];
	onAdd: (userId: string) => void;
}

export function AddPeoplePicker({ people, onAdd }: AddPeoplePickerProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-fill-hover hover:text-foreground"
				>
					<LuUserPlus className="size-4" />
					<Trans>Add people</Trans>
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-0">
				<Command>
					<CommandInput placeholder={t({ message: "Search people" })} />
					<CommandList>
						<CommandEmpty>
							<Trans>No one to add</Trans>
						</CommandEmpty>
						{people.map((person) => (
							<CommandItem
								key={person.id}
								value={`${person.name} ${person.id}`}
								onSelect={() => {
									onAdd(person.id);
									setOpen(false);
								}}
							>
								<Avatar size="xs" fullName={person.name} image={person.image} />
								<span className="truncate">{person.name}</span>
							</CommandItem>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
