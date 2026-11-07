"use client";

import { Trans } from "@lingui/react/macro";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@superset/ui/dialog";
import type { ComponentProps } from "react";
import { InvestorItem } from "../InvestorItem";

interface AllInvestorsDialogProps {
	investors: ComponentProps<typeof InvestorItem>["investor"][];
}

export function AllInvestorsDialog({ investors }: AllInvestorsDialogProps) {
	return (
		<Dialog modal>
			<DialogTrigger className="rounded-xs text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
				<Trans>...and many more!</Trans>
			</DialogTrigger>
			<DialogContent className="flex max-h-[min(85dvh,48rem)] flex-col gap-0 rounded-none p-0 sm:max-w-3xl">
				<DialogHeader className="border-b border-border px-6 pt-6 pb-5 pr-12 text-left">
					<DialogTitle className="text-2xl font-normal leading-tight text-foreground">
						<Trans>Our investors</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>The funds and angels who back our team.</Trans>
					</DialogDescription>
				</DialogHeader>
				<ul className="grid min-h-0 grid-cols-1 gap-x-8 gap-y-6 overflow-y-auto overscroll-contain px-6 py-6 md:grid-cols-2">
					{investors.map((investor) => (
						<li key={investor.name}>
							<InvestorItem investor={investor} />
						</li>
					))}
				</ul>
			</DialogContent>
		</Dialog>
	);
}
