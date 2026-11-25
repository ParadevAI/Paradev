import { Trans } from "@lingui/react/macro";
import { Spinner } from "@superset/ui/spinner";
import { useEffect, useState } from "react";

const SLOW_LOAD_MS = 500;

export function TranscriptLoadState({
	empty,
	loading,
	unreachable,
}: {
	empty: boolean;
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
