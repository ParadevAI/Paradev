import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { TrackedLink } from "@/app/[lang]/components/TrackedLink";
import { checkoutHref } from "@/app/[lang]/pricing/utils/checkoutHref";
import { env } from "@/env";

interface UpgradeActionsProps {
	placement: "hero" | "footer";
}

export function UpgradeActions({ placement }: UpgradeActionsProps) {
	return (
		<div className="mt-8 flex flex-wrap items-center gap-3">
			<TrackedLink
				href={checkoutHref(env.NEXT_PUBLIC_WEB_URL, "team", false)}
				event="checkout_clicked"
				properties={{ source: "cloud", placement, tier: "team" }}
				className="group flex items-center gap-2 bg-foreground px-6 py-3 text-background transition-colors hover:bg-brand hover:text-white"
			>
				<Trans>Upgrade to Team</Trans>
				<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
			</TrackedLink>
			<Link
				href="/pricing"
				className="border border-border px-6 py-3 text-foreground transition-colors hover:bg-muted"
			>
				<Trans>Compare plans</Trans>
			</Link>
			<a
				href={`${COMPANY.DOCS_URL}/cloud-workspaces`}
				className="px-3 py-3 text-muted-foreground transition-colors hover:text-foreground"
			>
				<Trans>Read the docs</Trans>
			</a>
		</div>
	);
}
