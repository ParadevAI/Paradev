import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import type { CardAction } from "../../../../types";
import { ActionButton } from "../../../ActionButton";

export type UpdateMethod = "merge" | "rebase";

interface UpdateBranchButtonProps {
	/** The card's `update` action; absent draws nothing. */
	action: CardAction | undefined;
	pending: boolean;
	/** The confirm for each way to update. */
	plan: Record<UpdateMethod, string>;
	onUpdate: (method: UpdateMethod) => void;
}

/** GitHub's "Update branch" split button: the menu picks merge or rebase, and the button does it after asking. */
export function UpdateBranchButton({
	action,
	pending,
	plan,
	onUpdate,
}: UpdateBranchButtonProps) {
	const { t } = useLingui();
	const [method, setMethod] = useState<UpdateMethod>("merge");
	if (!action) return null;
	return (
		<div className="inline-flex">
			<ActionButton
				action={action}
				pending={pending}
				confirmText={plan[method]}
				className="rounded-r-none"
				onClick={() => onUpdate(method)}
			>
				{method === "rebase" ? <Trans>Update with rebase</Trans> : action.label}
			</ActionButton>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						size="sm"
						disabled={pending || Boolean(action.disabled)}
						aria-label={t({ message: "Choose how to update the branch" })}
						className="rounded-l-none border-l border-primary-foreground/25 px-1.5"
					>
						<LuChevronDown className="size-3.5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56">
					<DropdownMenuRadioGroup
						value={method}
						onValueChange={(next) => setMethod(next as UpdateMethod)}
					>
						<DropdownMenuRadioItem value="merge">
							<Trans>Update with merge commit</Trans>
						</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="rebase">
							<Trans>Update with rebase</Trans>
						</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
