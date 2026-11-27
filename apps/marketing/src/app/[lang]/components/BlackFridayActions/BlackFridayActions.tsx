"use client";

import { COMPANY } from "@superset/shared/constants";
import { cn } from "@superset/ui/utils";
import { FaGithub } from "react-icons/fa";
import { TrackedLink } from "@/app/[lang]/components/TrackedLink";
import { checkoutHref } from "@/app/[lang]/pricing/utils/checkoutHref";
import { env } from "@/env";
import { track } from "@/lib/analytics";

export function BlackFridayActions({
	source,
	className,
}: {
	source: string;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-center justify-center gap-2 sm:gap-4",
				className,
			)}
		>
			<TrackedLink
				href={checkoutHref(env.NEXT_PUBLIC_WEB_URL, "pro", false)}
				event="checkout_clicked"
				properties={{ source, tier: "pro" }}
				className="bg-foreground text-background px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-normal transition-colors hover:bg-brand hover:text-white"
			>
				Get Pro free for 90 days
			</TrackedLink>
			<button
				type="button"
				className="px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-normal bg-background border border-border text-foreground hover:bg-muted transition-colors flex items-center gap-2"
				onClick={() => {
					track("github_clicked", { source });
					window.open(COMPANY.GITHUB_URL, "_blank", "noopener,noreferrer");
				}}
			>
				Star on GitHub
				<FaGithub aria-hidden className="size-4" />
			</button>
		</div>
	);
}
