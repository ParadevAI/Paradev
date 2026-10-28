import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { CHAT_COLUMN_CLASSNAME, CHAT_GUTTER_CLASSNAME } from "../../constants";

export function ConnectionNotice({ children }: { children: ReactNode }) {
	return (
		<div className={CHAT_GUTTER_CLASSNAME}>
			<output
				className={cn(
					CHAT_COLUMN_CLASSNAME,
					"flex items-center gap-2 px-4 pb-1 font-sans text-foreground/50 text-xs",
				)}
			>
				<Spinner className="size-3" />
				<span className="min-w-0 truncate">{children}</span>
			</output>
		</div>
	);
}
