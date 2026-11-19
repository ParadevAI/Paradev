import { cloneElement, type ReactElement, type ReactNode } from "react";
import { LuArrowUpRight } from "react-icons/lu";
import { Button } from "../ui/button";

export function PageLink({
	children,
}: {
	children: ReactElement<{ children?: ReactNode }>;
}) {
	return (
		<Button
			asChild
			variant="ghost"
			size="sm"
			className="h-8 gap-1.5 px-3 text-muted-foreground hover:text-foreground"
		>
			{cloneElement(
				children,
				undefined,
				<span>{children.props.children}</span>,
				<LuArrowUpRight key="arrow" className="size-3.5" aria-hidden />,
			)}
		</Button>
	);
}
