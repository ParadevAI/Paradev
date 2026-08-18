import type { TriggerActor } from "@superset/shared/automation-triggers";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import type { ScopeOption } from "../../scopeOption";
import { ChipButton } from "../ChipButton";

function actorLabel(actor: TriggerActor, people: ScopeOption[]): string {
	if (actor === "anyone") return "Anyone";
	// Legacy rows only; the picker no longer offers "me".
	if (actor === "me") return "Me";
	if (actor.ids.length === 0) return "Select people";
	if (actor.ids.length === 1) {
		const match = people.find((p) => p.id === actor.ids[0]);
		return match?.label ?? actor.ids[0] ?? "Select people";
	}
	return `${actor.ids.length} people`;
}

/**
 * Multi-select over the provider's own people, plus "Anyone".
 *
 * `allowCustom` adds a field for values that are not pickable — an email
 * address — which then sit in the list like any chosen person.
 */
export function ActorChip({
	actor,
	onChange,
	people,
	allowCustom,
	disabled,
	className,
}: {
	actor: TriggerActor;
	onChange: (next: TriggerActor) => void;
	people: ScopeOption[];
	allowCustom?: { placeholder: string };
	disabled?: boolean;
	className?: string;
}) {
	const ids = typeof actor === "string" ? [] : actor.ids;
	const empty = typeof actor !== "string" && ids.length === 0;
	const [custom, setCustom] = useState("");

	const toggle = (id: string) => {
		const next = ids.includes(id) ? ids.filter((p) => p !== id) : [...ids, id];
		onChange(next.length ? { ids: next } : "anyone");
	};

	const addCustom = () => {
		const value = custom.trim();
		if (!value) return;
		if (!ids.includes(value)) {
			onChange({ ids: [...ids, value] });
		}
		setCustom("");
	};

	// Typed values that no person describes still need a row to be unticked.
	const customSelected = ids.filter(
		(id) => !people.some((person) => person.id === id),
	);

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
				{people.map((person) => (
					<DropdownMenuCheckboxItem
						key={person.id}
						checked={ids.includes(person.id)}
						onCheckedChange={() => toggle(person.id)}
					>
						{person.label}
					</DropdownMenuCheckboxItem>
				))}
				{allowCustom &&
					customSelected.map((id) => (
						<DropdownMenuCheckboxItem
							key={id}
							checked
							onCheckedChange={() => toggle(id)}
						>
							{id}
						</DropdownMenuCheckboxItem>
					))}
				{people.length === 0 && !allowCustom && (
					<DropdownMenuItem disabled>No people to choose yet</DropdownMenuItem>
				)}
				{allowCustom && (
					<>
						<DropdownMenuSeparator />
						<div className="p-1">
							<Input
								value={custom}
								placeholder={allowCustom.placeholder}
								disabled={disabled}
								onChange={(event) => setCustom(event.target.value)}
								// The menu owns arrow keys and typeahead; the field keeps
								// what it types.
								onKeyDown={(event) => {
									event.stopPropagation();
									if (event.key === "Enter") {
										event.preventDefault();
										addCustom();
									}
								}}
								className="h-7 text-[13px]"
							/>
						</div>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
