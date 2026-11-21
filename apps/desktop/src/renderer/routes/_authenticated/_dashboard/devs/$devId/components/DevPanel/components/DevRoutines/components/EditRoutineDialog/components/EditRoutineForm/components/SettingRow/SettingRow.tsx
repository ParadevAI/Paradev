import type { ReactNode } from "react";

/** One row of a grouped settings box: a label, and its value or control on the right. */
export function SettingRow({
	label,
	children,
}: {
	label: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="group/row px-3 text-sm">
			<div className="flex min-h-11 items-center justify-between gap-3 border-input border-t py-1.5 group-first/row:border-t-0">
				<span className="shrink-0">{label}</span>
				<div className="flex min-w-0 items-center justify-end gap-2 text-muted-foreground">
					{children}
				</div>
			</div>
		</div>
	);
}
