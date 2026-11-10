import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { cn } from "@superset/ui/utils";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { useHostsNeedingUpdateCount } from "renderer/hooks/host-version/useHostsNeedingUpdate";
import type { SettingsSection } from "renderer/stores/settings-state";
import { useSettingsSectionVisibility } from "../../hooks/useSettingsSectionVisibility";
import {
	isSettingsSectionVisible,
	SETTINGS_SECTION_GROUPS,
} from "../../utils/settingsSections";
import { settingsListItemClass } from "../SettingsListSidebar";

interface GeneralSettingsProps {
	matchCounts: Partial<Record<SettingsSection, number>> | null;
}

export function GeneralSettings({ matchCounts }: GeneralSettingsProps) {
	const visibility = useSettingsSectionVisibility();
	const matchRoute = useMatchRoute();
	const hostsNeedingUpdate = useHostsNeedingUpdateCount();

	return (
		<>
			{SETTINGS_SECTION_GROUPS.map((group, groupIndex) => {
				const platformItems = group.items.filter((item) =>
					isSettingsSectionVisible(item, visibility),
				);
				const filteredItems = matchCounts
					? platformItems.filter((item) => (matchCounts[item.section] ?? 0) > 0)
					: platformItems;

				if (filteredItems.length === 0) return null;

				return (
					<div key={group.label.id} className={cn(groupIndex > 0 && "mt-4")}>
						<h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.075em] px-3 mb-1">
							{i18n._(group.label)}
						</h2>
						<nav className="flex flex-col">
							{filteredItems.map((section) => {
								const isActive = !!matchRoute({
									to: section.id,
									fuzzy: true,
								});
								const count = matchCounts?.[section.section];

								return (
									<Link
										key={section.id}
										to={section.id}
										className={settingsListItemClass(
											isActive,
											"gap-2 px-3 text-left",
										)}
									>
										<section.icon className="h-4 w-4" />
										<span className="flex-1">{i18n._(section.label)}</span>
										{count !== undefined && count > 0 && (
											<span className="text-xs text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded">
												{count}
											</span>
										)}
										{!matchCounts &&
											section.section === "hosts" &&
											hostsNeedingUpdate > 0 && (
												<span
													className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-amber-700 ring-1 ring-inset ring-amber-500/35 dark:text-amber-300"
													title={i18n._({
														...msg({
															message:
																"{count} hosts run an older host service than this app",
														}),
														values: { count: hostsNeedingUpdate },
													})}
												>
													<span
														aria-hidden="true"
														className="size-1.5 rounded-full bg-amber-500"
													/>
													{hostsNeedingUpdate}
												</span>
											)}
									</Link>
								);
							})}
						</nav>
					</div>
				);
			})}
		</>
	);
}
