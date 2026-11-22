import { Spinner } from "@superset/ui/spinner";
import type { ReactNode } from "react";

export function SignInProgress({
	title,
	children,
}: {
	title: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center gap-2 py-4 text-center">
			<Spinner className="size-5" />
			<p className="font-medium">{title}</p>
			<p className="text-muted-foreground text-sm">{children}</p>
		</div>
	);
}
