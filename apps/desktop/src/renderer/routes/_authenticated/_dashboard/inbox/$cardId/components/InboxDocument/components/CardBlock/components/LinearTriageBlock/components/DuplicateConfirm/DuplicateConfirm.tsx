import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuArrowDown } from "react-icons/lu";
import type {
	CardAction,
	LinearIssueView,
	LinearPersonView,
} from "../../../../types";
import { ActionButton } from "../../../ActionButton";
import { IssueSummary } from "./components/IssueSummary";

interface DuplicateConfirmProps {
	issue: LinearIssueView;
	original: LinearIssueView;
	members: readonly LinearPersonView[];
	action: CardAction | undefined;
	pending: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

/** Linear's duplicate confirmation: the issue in view, the one it repeats, and the two ways out. */
export function DuplicateConfirm({
	issue,
	original,
	members,
	action,
	pending,
	onConfirm,
	onCancel,
}: DuplicateConfirmProps) {
	return (
		<div className="flex flex-col gap-3">
			<div className="rounded-lg border border-border">
				<div className="flex flex-col gap-2 p-3">
					<span className="self-start rounded bg-fill-hover px-1.5 py-0.5 text-xs text-muted-foreground">
						<Trans>Currently viewing</Trans>
					</span>
					<IssueSummary issue={issue} members={members} />
				</div>
				<div className="relative flex justify-center border-t border-border">
					<span className="-mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-foreground">
						<LuArrowDown className="size-3" />
						<Trans>Duplicate of</Trans>
					</span>
				</div>
				<div className="p-3">
					<IssueSummary issue={original} members={members} />
				</div>
			</div>
			<div className="flex items-center justify-end gap-2">
				<Button type="button" size="sm" variant="outline" onClick={onCancel}>
					<Trans>Cancel</Trans>
				</Button>
				<ActionButton action={action} pending={pending} onClick={onConfirm}>
					<Trans>Mark as duplicate</Trans>
				</ActionButton>
			</div>
		</div>
	);
}
