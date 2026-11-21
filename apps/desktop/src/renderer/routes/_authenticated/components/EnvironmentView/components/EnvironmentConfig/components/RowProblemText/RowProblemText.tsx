import { Trans } from "@lingui/react/macro";
import { MAX_PREVIEW_PORTS } from "@superset/shared/project-config";
import type { RowProblem } from "../../utils/configForm";

interface RowProblemTextProps {
	problem: RowProblem | undefined;
}

export function RowProblemText({ problem }: RowProblemTextProps) {
	if (!problem) return null;
	return (
		<p className="pl-1 text-xs text-destructive">
			{problem === "name" ? (
				<Trans>
					Use lowercase letters, digits and underscores, starting with a letter.
				</Trans>
			) : problem === "duplicate" ? (
				<Trans>Another row already uses this name.</Trans>
			) : problem === "command" ? (
				<Trans>Enter a command.</Trans>
			) : problem === "previewLimit" ? (
				<Trans>At most {MAX_PREVIEW_PORTS} ports can have a preview.</Trans>
			) : (
				<Trans>Enter a port from 1 to 65535.</Trans>
			)}
		</p>
	);
}
