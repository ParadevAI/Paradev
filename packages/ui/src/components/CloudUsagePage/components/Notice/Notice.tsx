import type { ReactNode } from "react";

/** The page's empty, loading and error states, in the same surface as its summary cards. */
export function Notice({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-lg bg-muted/60 px-4 py-10 text-center text-sm text-muted-foreground">
			{children}
		</div>
	);
}
