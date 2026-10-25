import { Trans, useLingui } from "@lingui/react/macro";
import type { AccountColor } from "@superset/shared/account-colors";
import { Button } from "@superset/ui/button";
import { AccountColorPicker } from "renderer/components/AccountColorPicker";
import { ProviderIcon } from "renderer/components/ProviderIcon";
import {
	type WidgetAccount,
	type WidgetPreferences,
	widgetAccountLabel,
} from "shared/usage-widget/model";

export function WidgetAccountAppearance({
	accounts,
	preferences,
	dark,
	saving,
	onColorChange,
	onHiddenChange,
}: {
	accounts: WidgetAccount[];
	preferences: WidgetPreferences;
	dark: boolean;
	saving: boolean;
	onColorChange: (
		accountId: string,
		color: AccountColor | null,
	) => Promise<void>;
	onHiddenChange: (accountId: string, hidden: boolean) => void;
}) {
	const { t } = useLingui();
	return (
		<div className="p-4 space-y-3">
			<h4 className="text-sm font-medium">
				<Trans>Account appearance</Trans>
			</h4>
			<p className="text-xs text-muted-foreground">
				<Trans>All accounts appear on the edge unless you hide them.</Trans>
			</p>
			<ul
				className="space-y-2"
				aria-label={t({ message: "Account appearance" })}
			>
				{accounts.map((account, index) => {
					const label = widgetAccountLabel(
						account,
						index,
						preferences.hideEmails,
					);
					const hidden = preferences.hiddenAccountIds.includes(account.id);
					return (
						<li key={account.id} className="flex items-center gap-2 text-sm">
							<ProviderIcon
								provider={account.provider}
								color={account.color}
								dark={dark}
								className="size-4 shrink-0"
							/>
							<span className="min-w-0 flex-1 truncate" title={label}>
								{label}
							</span>
							<AccountColorPicker
								accountLabel={label}
								color={account.color}
								dark={dark}
								saving={saving}
								onSave={(color) => onColorChange(account.id, color)}
							/>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={saving}
								aria-label={`${hidden ? t({ message: "Show account" }) : t({ message: "Hide account" })} · ${label}`}
								aria-pressed={hidden}
								onClick={() => onHiddenChange(account.id, !hidden)}
							>
								{hidden ? <Trans>Show</Trans> : <Trans>Hide</Trans>}
							</Button>
						</li>
					);
				})}
			</ul>
			{accounts.length === 0 && (
				<p className="text-xs text-muted-foreground">
					<Trans>Add an account to see its usage here.</Trans>
				</p>
			)}
		</div>
	);
}
