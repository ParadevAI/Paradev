import { Trans, useLingui } from "@lingui/react/macro";
import { X } from "lucide-react";
import type { WorkspaceCheckout } from "../../../../state/activeRepositoryStore";

export function CheckoutFailureNotice({
	checkouts,
	onDismiss,
}: {
	checkouts: readonly WorkspaceCheckout[];
	onDismiss: () => void;
}) {
	const { t } = useLingui();
	const failed = checkouts.flatMap(({ name, boxCheckout }) =>
		boxCheckout?.state === "failed"
			? [
					{
						name,
						baseBranch:
							boxCheckout.reason === "base_missing"
								? boxCheckout.baseBranch
								: null,
					},
				]
			: [],
	);
	if (failed.length === 0) return null;

	return (
		<div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-4">
			<div
				role="alert"
				className="pointer-events-auto flex max-w-full items-start gap-2.5 rounded-lg border border-border bg-popover py-1.5 pr-1.5 pl-3 text-sm text-popover-foreground shadow-lg"
			>
				<ul className="min-w-0 py-0.5 font-medium">
					{failed.map(({ name, baseBranch }) => (
						<li key={name}>
							{baseBranch ? (
								<Trans>
									Couldn't check out {name}: its branch {baseBranch} is not on
									the remote.
								</Trans>
							) : (
								<Trans>Couldn't clone {name}.</Trans>
							)}
						</li>
					))}
				</ul>
				<button
					type="button"
					aria-label={t({ message: "Dismiss" })}
					onClick={onDismiss}
					className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
				>
					<X className="size-3.5" />
				</button>
			</div>
		</div>
	);
}
