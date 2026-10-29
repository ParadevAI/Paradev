import { Label } from "@superset/ui/label";
import type { ReactNode } from "react";

interface EnvironmentPropertyRowProps {
	htmlFor: string;
	label: ReactNode;
	children: ReactNode;
}

/** One row of the editor's property list: a muted label, then the control, which may wrap. */
export function EnvironmentPropertyRow({
	htmlFor,
	label,
	children,
}: EnvironmentPropertyRowProps) {
	return (
		<div className="flex min-h-10 items-start">
			<Label
				className="flex h-10 w-28 shrink-0 items-center pl-3 text-xs font-normal text-muted-foreground"
				htmlFor={htmlFor}
			>
				{label}
			</Label>
			<div className="flex min-h-10 min-w-0 flex-1 items-center">
				{children}
			</div>
		</div>
	);
}
