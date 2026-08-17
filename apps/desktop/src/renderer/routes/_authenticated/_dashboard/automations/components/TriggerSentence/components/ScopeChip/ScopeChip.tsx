import type { TriggerScope } from "@superset/shared/automation-triggers";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { ScopeOption } from "../../scopeOption";
import { ChipButton } from "../ChipButton";

function scopeLabel(
	scope: TriggerScope,
	options: ScopeOption[],
	emptyLabel: string,
	anyLabel: string,
): string {
	if (scope === null) return emptyLabel;
	if (scope.mode === "any") return anyLabel;
	if (scope.ids.length === 0) return emptyLabel;
	if (scope.ids.length === 1) {
		const match = options.find((o) => o.id === scope.ids[0]);
		return match?.label ?? scope.ids[0] ?? emptyLabel;
	}
	return `${scope.ids.length} selected`;
}

/**
 * Multi-select over a known set, plus an explicit "any".
 *
 * "Any" is its own entry rather than the empty state, because an empty
 * selection matches nothing — that asymmetry is what stops a half-built trigger
 * firing on everything, so choosing "any" has to be deliberate.
 */
export function ScopeChip({
	scope,
	onChange,
	options,
	emptyLabel,
	anyLabel,
	disabled,
	className,
}: {
	scope: TriggerScope;
	onChange: (next: TriggerScope) => void;
	options: ScopeOption[];
	emptyLabel: string;
	anyLabel: string;
	disabled?: boolean;
	className?: string;
}) {
	const selected = scope !== null && scope.mode === "list" ? scope.ids : [];
	const isAny = scope !== null && scope.mode === "any";
	const empty = scope === null || (scope.mode === "list" && !scope.ids.length);

	const toggle = (id: string) => {
		const next = selected.includes(id)
			? selected.filter((s) => s !== id)
			: [...selected, id];
		onChange(next.length ? { mode: "list", ids: next } : null);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<span>
					<ChipButton
						label={scopeLabel(scope, options, emptyLabel, anyLabel)}
						empty={empty}
						disabled={disabled}
						className={className}
					/>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
				<DropdownMenuCheckboxItem
					checked={isAny}
					onCheckedChange={() => onChange(isAny ? null : { mode: "any" })}
				>
					{anyLabel}
				</DropdownMenuCheckboxItem>
				{options.map((option) => (
					<DropdownMenuCheckboxItem
						key={option.id}
						checked={selected.includes(option.id)}
						onCheckedChange={() => toggle(option.id)}
					>
						{option.label}
					</DropdownMenuCheckboxItem>
				))}
				{options.length === 0 && (
					<DropdownMenuItem disabled>Nothing to choose yet</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
