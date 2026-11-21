"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../../../../ui/select";

const ANY = "any";

interface FilterSelectProps<T extends string> {
	/** "Any person", "Any size", …: the label for no filter. */
	any: string;
	value: T | undefined;
	options: { value: T; label: string }[];
	onChange: (value: T | undefined) => void;
}

export function FilterSelect<T extends string>({
	any,
	value,
	options,
	onChange,
}: FilterSelectProps<T>) {
	return (
		<Select
			value={value ?? ANY}
			onValueChange={(next) => onChange(next === ANY ? undefined : (next as T))}
		>
			<SelectTrigger size="sm" className="min-w-0" aria-label={any}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ANY}>{any}</SelectItem>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
