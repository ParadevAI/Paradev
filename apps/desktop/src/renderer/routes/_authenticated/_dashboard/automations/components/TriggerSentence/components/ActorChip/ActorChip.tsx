import type { TriggerActor } from "@superset/shared/automation-triggers";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { ScopeOption } from "../../scopeOption";
import { ChipButton } from "../ChipButton";

function actorLabel(actor: TriggerActor, people: ScopeOption[]): string {
	if (actor === "anyone") return "Anyone";
	if (actor === "me") return "Me";
	if (actor.ids.length === 0) return "Select people";
	if (actor.ids.length === 1) {
		const match = people.find((p) => p.id === actor.ids[0]);
		return match?.label ?? actor.ids[0] ?? "Select people";
	}
	return `${actor.ids.length} people`;
}

export function ActorChip({
	actor,
	onChange,
	people,
	disabled,
	className,
}: {
	actor: TriggerActor;
	onChange: (next: TriggerActor) => void;
	people: ScopeOption[];
	disabled?: boolean;
	className?: string;
}) {
	const ids = typeof actor === "string" ? [] : actor.ids;
	const empty = typeof actor !== "string" && ids.length === 0;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<span>
					<ChipButton
						label={actorLabel(actor, people)}
						empty={empty}
						disabled={disabled}
						className={className}
					/>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
				<DropdownMenuCheckboxItem
					checked={actor === "anyone"}
					onCheckedChange={() => onChange("anyone")}
				>
					Anyone
				</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem
					checked={actor === "me"}
					onCheckedChange={() => onChange("me")}
				>
					Me
				</DropdownMenuCheckboxItem>
				{people.map((person) => (
					<DropdownMenuCheckboxItem
						key={person.id}
						checked={ids.includes(person.id)}
						onCheckedChange={() => {
							const next = ids.includes(person.id)
								? ids.filter((p) => p !== person.id)
								: [...ids, person.id];
							onChange(next.length ? { ids: next } : "anyone");
						}}
					>
						{person.label}
					</DropdownMenuCheckboxItem>
				))}
				{people.length === 0 && (
					<DropdownMenuItem disabled>No linked accounts yet</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
