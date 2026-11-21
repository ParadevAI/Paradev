import { Slottable } from "@radix-ui/react-slot";
import type { ReactNode } from "react";
import { LuArrowUpRight } from "react-icons/lu";
import { Button } from "../ui/button";

/** A link to another page: a ghost button with a short noun and the up-right arrow. Wraps the app's link element. */
export function PageLink({ children }: { children: ReactNode }) {
	return (
		<Button
			asChild
			variant="ghost"
			size="sm"
			className="h-8 gap-1.5 px-3 text-muted-foreground hover:text-foreground"
		>
			<Slottable>{children}</Slottable>
			<LuArrowUpRight className="size-3.5" aria-hidden />
		</Button>
	);
}
