import type { ReactNode } from "react";

interface SectionProps {
	title: ReactNode;
	action?: ReactNode;
	children: ReactNode;
}

/** A titled part of a page, on the page background. */
export function Section({ title, action, children }: SectionProps) {
	return (
		<section className="min-w-0 space-y-3">
			<div className="flex min-h-8 items-center justify-between gap-4">
				<h3 className="text-base font-semibold">{title}</h3>
				{action}
			</div>
			{children}
		</section>
	);
}
