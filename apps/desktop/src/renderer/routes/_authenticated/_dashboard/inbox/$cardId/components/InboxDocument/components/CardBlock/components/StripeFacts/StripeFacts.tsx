import type { ReactNode } from "react";

interface StripeFactsProps {
	/** An entry that is false or null draws no row. */
	rows: ({ label: string; value: ReactNode } | false | null)[];
}

/** Facts of a Stripe object in rows, label then value. */
export function StripeFacts({ rows }: StripeFactsProps) {
	return (
		<dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-[13px]">
			{rows.map(
				(row) =>
					row && (
						<div key={row.label} className="contents">
							<dt className="text-muted-foreground">{row.label}</dt>
							<dd className="min-w-0 break-words text-foreground">
								{row.value}
							</dd>
						</div>
					),
			)}
		</dl>
	);
}
