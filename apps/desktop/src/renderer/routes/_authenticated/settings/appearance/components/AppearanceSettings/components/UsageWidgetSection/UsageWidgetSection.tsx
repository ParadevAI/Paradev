import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	PROVIDER_NAMES,
	PROVIDERS,
	type WidgetPreferences,
} from "shared/usage-widget/model";
import { WidgetAccountAppearance } from "./components/WidgetAccountAppearance/WidgetAccountAppearance";
import { WidgetSelect } from "./components/WidgetSelect/WidgetSelect";

export function UsageWidgetSection() {
	const { t } = useLingui();
	const dark = useIsDarkTheme();
	const utils = electronTrpc.useUtils();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const { data, error } = electronTrpc.usageWidget.get.useQuery(undefined, {
		enabled: platform === "darwin",
		refetchInterval: 30_000,
	});
	const update = electronTrpc.usageWidget.update.useMutation({
		onSuccess: (value) => utils.usageWidget.get.setData(undefined, value),
		onError: () => toast.error(t`Could not save usage display settings.`),
	});
	const appearance = electronTrpc.usageWidget.setAccountAppearance.useMutation({
		onSuccess: (value) => utils.usageWidget.get.setData(undefined, value),
	});
	const visibility = electronTrpc.usageWidget.setAccountHidden.useMutation({
		onSuccess: (value) => utils.usageWidget.get.setData(undefined, value),
		onError: () => toast.error(t`Could not save usage display settings.`),
	});
	const previewReset = electronTrpc.usageWidget.previewReset.useMutation({
		onError: () => toast.error(t`Could not open usage.`),
	});
	const preview = electronTrpc.usageWidget.preview.useMutation({
		onError: () => toast.error(t`Could not open usage.`),
	});
	if (platform !== "darwin") return null;
	if (!data)
		return (
			<div className="rounded-lg border p-4 text-sm text-muted-foreground">
				{error ? (
					<Trans>Could not load usage display settings.</Trans>
				) : (
					<Trans>Loading…</Trans>
				)}
			</div>
		);
	const p = data.preferences;
	const save = (value: Partial<WidgetPreferences>) => update.mutate(value);
	return (
		<section
			className="rounded-lg border border-border overflow-hidden"
			aria-label={t`Usage at a glance`}
		>
			<div className="flex items-center justify-between gap-4 p-4 border-b border-border">
				<div>
					<h3 className="text-sm font-medium">
						<Trans>Usage at a glance</Trans>
					</h3>
					<p className="text-xs text-muted-foreground mt-1">
						<Trans>
							Your accounts and quotas, in the menu bar or on the right screen
							edge.
						</Trans>
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={preview.isPending}
					onClick={() => preview.mutate()}
				>
					<Trans>Preview</Trans>
				</Button>
			</div>
			<label
				className="flex items-center justify-between gap-4 border-b p-4 text-sm"
				htmlFor="usage-reset-celebration"
			>
				<span>
					<Trans>Celebrate quota resets</Trans>
					<span className="mt-1 block text-xs text-muted-foreground">
						<Trans>
							Session confetti and a larger weekly celebration. Respects reduced
							motion.
						</Trans>
					</span>
				</span>
				<Switch
					id="usage-reset-celebration"
					checked={p.celebrateResets}
					disabled={update.isPending}
					onCheckedChange={(celebrateResets) => save({ celebrateResets })}
				/>
			</label>
			<div className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
				<Trans>Preview</Trans>
				<Button
					variant="outline"
					size="sm"
					aria-label={`${t`Preview`} · ${t`Session`}`}
					disabled={previewReset.isPending}
					onClick={() => previewReset.mutate("session")}
				>
					<Trans>Session</Trans>
				</Button>
				<Button
					variant="outline"
					size="sm"
					aria-label={`${t`Preview`} · ${t`Weekly`}`}
					disabled={previewReset.isPending}
					onClick={() => previewReset.mutate("weekly")}
				>
					<Trans>Weekly</Trans>
				</Button>
			</div>
			<fieldset
				disabled={update.isPending}
				className="divide-y divide-border disabled:opacity-70"
			>
				<div className="p-4 space-y-4">
					<WidgetSelect
						label={t`Menu bar`}
						value={p.menuBar}
						onChange={(v) =>
							save({ menuBar: v as WidgetPreferences["menuBar"] })
						}
						options={[
							["logo", t`Superset logo`],
							["providers", t`Provider icons and percentages`],
							["off", t`Off`],
						]}
					/>
					<label
						htmlFor="usage-widget-edge"
						className="flex items-center justify-between gap-4 text-sm"
					>
						<span>
							<Trans>Right screen edge</Trans>
							<span className="block text-xs text-muted-foreground mt-1">
								<Trans>
									Floats above other apps. Shows session and weekly usage for
									your quick-view accounts.
								</Trans>
							</span>
						</span>
						<Switch
							id="usage-widget-edge"
							checked={p.edge}
							onCheckedChange={(edge) => save({ edge })}
						/>
					</label>
					{p.edge && (
						<WidgetSelect
							label={t`Display`}
							value={p.displayId === null ? "primary" : String(p.displayId)}
							onChange={(v) =>
								save({ displayId: v === "primary" ? null : Number(v) })
							}
							options={[
								["primary", t`Primary display`],
								...data.displays.map(
									(d) => [String(d.id), d.label] as [string, string],
								),
							]}
						/>
					)}
				</div>
				<div className="p-4 space-y-4">
					<WidgetSelect
						label={t`Percentage`}
						value={p.metric}
						onChange={(v) => save({ metric: v as WidgetPreferences["metric"] })}
						options={[
							["remaining", t`Remaining`],
							["used", t`Used`],
						]}
					/>
					<WidgetSelect
						label={t`Menu bar quota window`}
						value={p.window}
						onChange={(v) => save({ window: v as WidgetPreferences["window"] })}
						options={[
							["weekly", t`Weekly`],
							["session", t`Session`],
						]}
					/>
					<label
						htmlFor="usage-widget-emails"
						className="flex items-center justify-between gap-4 text-sm"
					>
						<span>
							<Trans>Hide emails</Trans>
						</span>
						<Switch
							id="usage-widget-emails"
							checked={p.hideEmails}
							onCheckedChange={(hideEmails) => save({ hideEmails })}
						/>
					</label>
					{data.hosts.length > 1 && (
						<WidgetSelect
							label={t`Organization`}
							value={p.hostId ?? "active"}
							onChange={(v) =>
								save({ hostId: v === "active" ? null : v, pinnedAccounts: {} })
							}
							options={[
								["active", t`Active window`],
								...data.hosts.map((h) => [h.id, h.label] as [string, string]),
							]}
						/>
					)}
				</div>
				<div className="p-4 space-y-3">
					<div>
						<h4 className="text-sm font-medium">
							<Trans>Menu bar accounts</Trans>
						</h4>
						<p className="text-xs text-muted-foreground mt-1">
							<Trans>
								Choose one account per menu bar icon. The notch shows all
								accounts unless you hide them. Missing or stale usage shows a
								dash.
							</Trans>
						</p>
					</div>
					{PROVIDERS.map((provider) => {
						const accounts = data.accounts.filter(
							(a) => a.provider === provider,
						);
						const pin = p.pinnedAccounts[provider];
						return (
							<div
								key={provider}
								className="flex items-center justify-between gap-4"
							>
								<label
									htmlFor={`usage-widget-${provider}`}
									className="flex items-center gap-2 text-sm"
								>
									<Checkbox
										id={`usage-widget-${provider}`}
										checked={p.providers.includes(provider)}
										onCheckedChange={(checked) =>
											save({
												providers:
													checked === true
														? [...new Set([...p.providers, provider])]
														: p.providers.filter((v) => v !== provider),
											})
										}
									/>
									{PROVIDER_NAMES[provider]}
								</label>
								<WidgetSelect
									label={PROVIDER_NAMES[provider]}
									hideLabel
									value={pin ?? "default"}
									onChange={(v) => {
										const pins = { ...p.pinnedAccounts };
										if (v === "default") delete pins[provider];
										else pins[provider] = v;
										save({ pinnedAccounts: pins });
									}}
									options={[
										["default", t`Default account`],
										...(pin && !accounts.some((a) => a.id === pin)
											? [[pin, t`Account unavailable`] as [string, string]]
											: []),
										...accounts.map(
											(a, i) =>
												[
													a.id,
													p.hideEmails
														? a.label.replace(
																/\S+@\S+/g,
																`${PROVIDER_NAMES[provider]} ${i + 1}`,
															)
														: a.label,
												] as [string, string],
										),
									]}
								/>
							</div>
						);
					})}
				</div>
				<WidgetAccountAppearance
					accounts={data.accounts}
					preferences={p}
					dark={dark}
					saving={
						update.isPending || appearance.isPending || visibility.isPending
					}
					onColorChange={async (accountId, color) => {
						await appearance.mutateAsync({ accountId, color });
					}}
					onHiddenChange={(accountId, hidden) =>
						visibility.mutate({ accountId, hidden })
					}
				/>
			</fieldset>
		</section>
	);
}
