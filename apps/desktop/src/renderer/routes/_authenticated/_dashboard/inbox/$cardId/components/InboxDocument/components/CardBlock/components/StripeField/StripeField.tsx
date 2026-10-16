import type { ReactNode } from "react";

interface StripeFieldProps {
	label: ReactNode;
	/** Drawn after the label, such as "Drafted". */
	tag?: ReactNode;
	children: ReactNode;
}

/** A form control under its label. */
export function StripeField({ label, tag, children }: StripeFieldProps) {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center gap-2 text-xs font-medium text-foreground">
				{label}
				{tag}
			</div>
			{children}
		</div>
	);
}
