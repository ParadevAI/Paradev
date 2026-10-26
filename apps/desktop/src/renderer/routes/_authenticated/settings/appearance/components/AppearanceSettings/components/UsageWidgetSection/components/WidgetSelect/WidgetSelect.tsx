import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useId } from "react";

export function WidgetSelect({
	label,
	value,
	onChange,
	options,
	hideLabel = false,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	options: [string, string][];
	hideLabel?: boolean;
}) {
	const id = useId();
	return (
		<div
			className={
				hideLabel
					? "min-w-0"
					: "flex items-center justify-between gap-4 text-sm"
			}
		>
			<label htmlFor={id} className={hideLabel ? "sr-only" : "shrink-0"}>
				{label}
			</label>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger id={id} size="sm" className="w-56 max-w-full text-xs">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map(([key, name]) => (
						<SelectItem key={key} value={key}>
							{name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
