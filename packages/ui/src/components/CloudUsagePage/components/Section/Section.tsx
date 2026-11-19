import type { ReactNode } from "react";
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from "../../../ui/card";

interface SectionProps {
	title: ReactNode;
	action?: ReactNode;
	children: ReactNode;
}

/** The pages' one card surface: a titled kit card. */
export function Section({ title, action, children }: SectionProps) {
	return (
		<Card className="min-w-0 gap-4 py-5">
			<CardHeader className="items-center px-5">
				<CardTitle role="heading" aria-level={3} className="text-base">
					{title}
				</CardTitle>
				{action && <CardAction>{action}</CardAction>}
			</CardHeader>
			<CardContent className="px-5">{children}</CardContent>
		</Card>
	);
}
