import { Trans } from "@lingui/react/macro";
import { CircleCheck } from "lucide-react";

export function ReviewCard() {
	return (
		<div className="mt-3 rounded-md border border-border bg-popover px-4 py-3.5 shadow-xl">
			<p className="flex items-center gap-2 text-foreground text-sm">
				<CircleCheck className="size-4 text-emerald-500" />
				<Trans>Draft PR #2841</Trans>
				<span className="ml-auto font-mono text-xs">
					<span className="text-emerald-500">+24</span>{" "}
					<span className="text-red-500">−3</span>
				</span>
			</p>
			<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
				<Trans>
					Fix cart total for empty carts. Adds a test that reproduces the
					TypeError.
				</Trans>
			</p>
		</div>
	);
}
