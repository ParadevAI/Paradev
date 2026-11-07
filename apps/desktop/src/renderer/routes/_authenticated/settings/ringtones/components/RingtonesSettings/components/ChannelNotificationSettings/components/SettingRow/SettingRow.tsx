import { Label } from "@superset/ui/label";
import type { ReactNode } from "react";

export function SettingRow({
	id,
	label,
	description,
	children,
}: {
	id: string;
	label: ReactNode;
	description?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="space-y-0.5">
				<Label htmlFor={id} className="text-sm font-medium">
					{label}
				</Label>
				{description && (
					<p className="text-xs text-muted-foreground">{description}</p>
				)}
			</div>
			{children}
		</div>
	);
}
