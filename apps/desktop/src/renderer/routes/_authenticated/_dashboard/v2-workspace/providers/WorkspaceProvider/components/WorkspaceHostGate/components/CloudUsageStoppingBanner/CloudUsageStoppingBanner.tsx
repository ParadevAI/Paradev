import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { LuTriangleAlert } from "react-icons/lu";

export function CloudUsageStoppingBanner() {
	const { t } = useLingui();

	return (
		<div
			role="alert"
			className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground/85"
		>
			<LuTriangleAlert
				className="size-4 shrink-0 text-foreground/85"
				aria-hidden="true"
			/>
			<span className="min-w-0 flex-1 select-text">
				{t({
					message:
						"Your organization reached its cloud usage limit. This workspace stops in a few minutes unless the limit is raised.",
				})}
			</span>
			<Link
				to="/settings/billing"
				className="shrink-0 font-medium underline underline-offset-4"
			>
				{t({ message: "Open billing" })}
			</Link>
		</div>
	);
}
