import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LuTriangleAlert } from "react-icons/lu";

export function CloudUsageRefusedBanner({
	workspaceId,
	error,
}: {
	workspaceId: string;
	error: unknown;
}) {
	const { t } = useLingui();
	const queryClient = useQueryClient();

	return (
		<div
			role="alert"
			className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground/85"
		>
			<LuTriangleAlert
				className="size-4 shrink-0 text-destructive"
				aria-hidden="true"
			/>
			<span className="min-w-0 flex-1 select-text">{errorMessage(error)}</span>
			<Link
				to="/settings/billing"
				className="shrink-0 font-medium underline underline-offset-4"
			>
				{t({ message: "Open billing" })}
			</Link>
			<button
				type="button"
				onClick={() =>
					queryClient.invalidateQueries({
						queryKey: ["cloud-workspace", "wake", workspaceId],
					})
				}
				className="shrink-0 rounded px-1.5 py-0.5 font-medium text-foreground hover:bg-destructive/20"
			>
				{t({ message: "Retry" })}
			</button>
		</div>
	);
}
