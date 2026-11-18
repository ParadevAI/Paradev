import { Trans } from "@lingui/react/macro";
import { Spinner } from "@superset/ui/spinner";
import { useEffect, useState } from "react";

const SLOW_LOAD_MS = 500;

export function TranscriptLoadState({
	empty,
	historyUnavailable,
	loading,
	unreachable,
}: {
	empty: boolean;
	historyUnavailable: boolean;
	loading: boolean;
	unreachable: boolean;
}) {
	const [slow, setSlow] = useState(false);
	useEffect(() => {
		if (!loading) {
			setSlow(false);
			return;
		}
		const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
		return () => clearTimeout(timer);
	}, [loading]);

	if (historyUnavailable) {
		return (
			<div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-4">
				<output className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-muted-foreground text-xs shadow-sm">
					<Spinner className="size-3" />
					<Trans>Couldn't load this chat's messages. Retrying…</Trans>
				</output>
			</div>
		);
	}
	if (!empty || !loading || (!unreachable && !slow)) return null;
	return (
		<output className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 p-4 text-center text-muted-foreground text-xs">
			<Spinner className="size-3" />
			{unreachable ? (
				<Trans>Can't reach this workspace's host. Retrying…</Trans>
			) : (
				<Trans>Loading chat</Trans>
			)}
		</output>
	);
}
