import { Trans } from "@lingui/react/macro";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";

interface AccountMenuItemsProps {
	onSwitchSignIn: (() => void) | null;
	/** Null for the system-default login, which is never removable. */
	onRemove: (() => void) | null;
	/** Whether the host reports that Paradev created the profile dir. Remove
	 * deletes no other dir. */
	createdByParadev: boolean;
}

/** The items of an account card's "…" menu. */
export function AccountMenuItems({
	onSwitchSignIn,
	onRemove,
	createdByParadev,
}: AccountMenuItemsProps) {
	return (
		<>
			{onSwitchSignIn && (
				<DropdownMenuItem onClick={onSwitchSignIn}>
					<Trans>Switch sign-in…</Trans>
				</DropdownMenuItem>
			)}
			{onRemove &&
				(createdByParadev ? (
					<DropdownMenuItem variant="destructive" onClick={onRemove}>
						<Trans>Remove…</Trans>
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem disabled className="flex-col items-start gap-0.5">
						<span>
							<Trans>Remove…</Trans>
						</span>
						<span className="text-xs text-muted-foreground">
							<Trans>Paradev only removes profiles it created.</Trans>
						</span>
					</DropdownMenuItem>
				))}
		</>
	);
}
