import type { ReactNode } from "react";

interface SectionProps {
	title: ReactNode;
	/** At the right of the title, such as "View all". */
	action?: ReactNode;
	children: ReactNode;
}

export function Section({ title, action, children }: SectionProps) {
	return (
		<section className="min-w-0 space-y-3">
			<div className="flex items-baseline justify-between gap-3">
				<h3 className="text-base font-semibold">{title}</h3>
				{action}
			</div>
			{children}
		</section>
	);
}
