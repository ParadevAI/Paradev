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
import Image from "next/image";

interface AllInvestorsDialogProps {
	investors: { name: string; detail?: string; logo?: string }[];
}

export function AllInvestorsDialog({ investors }: AllInvestorsDialogProps) {
	return (
		<Dialog modal>
			<DialogTrigger className="rounded-xs text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
				<Trans>...and many more!</Trans>
			</DialogTrigger>
			<DialogContent className="flex max-h-[min(85dvh,48rem)] flex-col gap-0 rounded-none p-0 sm:max-w-xl">
				<DialogHeader className="border-b border-border px-6 pt-6 pb-5 pr-12 text-left">
					<DialogTitle className="text-2xl font-normal leading-tight text-foreground">
						<Trans>Our investors</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>The funds and angels who back our team.</Trans>
					</DialogDescription>
				</DialogHeader>
				<ul className="grid min-h-0 grid-cols-1 gap-x-8 gap-y-6 overflow-y-auto overscroll-contain px-6 py-6 sm:grid-cols-2">
					{investors.map((investor) => (
						<li key={investor.name} className="flex items-center gap-3">
							{investor.logo ? (
								<Image
									src={investor.logo}
									alt=""
									width={28}
									height={28}
									className="size-7 shrink-0 rounded-md"
								/>
							) : (
								<span
									aria-hidden
									className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-xs text-muted-foreground"
								>
									{investor.name.charAt(0)}
								</span>
							)}
							<div className="min-w-0">
								<p className="text-sm text-foreground">{investor.name}</p>
								{investor.detail && (
									<p className="text-sm text-muted-foreground">
										{investor.detail}
									</p>
								)}
							</div>
						</li>
					))}
				</ul>
			</DialogContent>
		</Dialog>
	);
}
