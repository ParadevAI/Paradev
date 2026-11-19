import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuFileCode, LuFileWarning, LuLoader } from "react-icons/lu";
import type { DeferredDiffReason } from "../../hooks/useDiffAnnotations";
import { DiffPlaceholder } from "../DiffPlaceholder";

interface DeferredDiffPlaceholderProps {
	reason: DeferredDiffReason;
	onRequest: () => void;
}

/** Stands in for a file whose diff isn't on screen: a generated artifact held
 * back on purpose, a patch still in flight, or one that failed to load. */
export function DeferredDiffPlaceholder({
	reason,
	onRequest,
}: DeferredDiffPlaceholderProps) {
	if (reason === "loading") {
		return (
			<DiffPlaceholder
				icon={<LuLoader className="animate-spin" />}
				message={<Trans>Loading diff…</Trans>}
			/>
		);
	}

	if (reason === "error") {
		return (
			<DiffPlaceholder
				icon={<LuFileWarning />}
				message={<Trans>Unable to load diff</Trans>}
			>
				<Button variant="outline" size="xs" onClick={onRequest}>
					<Trans>Retry</Trans>
				</Button>
			</DiffPlaceholder>
		);
	}

	return (
		<DiffPlaceholder
			icon={<LuFileCode />}
			message={<Trans>Generated file hidden</Trans>}
		>
			<Button variant="outline" size="xs" onClick={onRequest}>
				<Trans>Load diff</Trans>
			</Button>
		</DiffPlaceholder>
	);
}
