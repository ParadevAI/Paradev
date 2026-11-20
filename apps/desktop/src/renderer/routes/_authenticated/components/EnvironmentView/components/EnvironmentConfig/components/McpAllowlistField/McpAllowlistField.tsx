import { Trans, useLingui } from "@lingui/react/macro";
import { mcpPluginEntry } from "@superset/shared/project-config";
import { Checkbox } from "@superset/ui/checkbox";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Switch } from "@superset/ui/switch";
import { useMemo } from "react";
import { usePluginCatalog } from "renderer/hooks/usePluginCatalog";

interface PluginOption {
	entry: string;
	label: string;
	marketplace: string | null;
}

interface McpAllowlistFieldProps {
	enabled: boolean;
	onEnabledChange: (enabled: boolean) => void;
	value: string[] | null;
	onChange: (value: string[] | null) => void;
}

export function McpAllowlistField({
	enabled,
	onEnabledChange,
	value,
	onChange,
}: McpAllowlistFieldProps) {
	const { t } = useLingui();
	const { plugins, isLoading } = usePluginCatalog();
	const allowed = useMemo(() => new Set(value ?? []), [value]);

	const options = useMemo<PluginOption[]>(() => {
		const listed = plugins
			.map((plugin) => ({
				entry: mcpPluginEntry(plugin),
				label: plugin.interface?.displayName ?? plugin.name,
				marketplace: plugin.marketplace,
				shown: plugin.installed || plugin.managed,
			}))
			.filter((option) => option.shown || allowed.has(option.entry))
			.map(({ shown: _, ...option }) => option);
		const listedEntries = new Set(listed.map((option) => option.entry));
		const unlisted = [...allowed]
			.filter((entry) => !listedEntries.has(entry))
			.map((entry) => ({ entry, label: entry, marketplace: null }));
		return [...listed, ...unlisted];
	}, [plugins, allowed]);

	return (
		<div className="flex flex-col gap-1.5 p-3">
			<span className="text-xs font-medium">
				<Trans>MCP allowlist</Trans>
			</span>
			<p className="text-xs text-muted-foreground">
				<Trans>
					Which plugins' MCP servers cloud agents can use in this environment.
				</Trans>
			</p>
			<div className="divide-y divide-border/70 overflow-hidden rounded-md border border-border/70">
				<div className="flex items-center justify-between gap-4 px-3 py-2.5">
					<div className="flex flex-col gap-0.5">
						<Label
							className="text-sm font-normal"
							htmlFor="environment-mcp-disabled"
						>
							<Trans>Disable MCP servers</Trans>
						</Label>
						<span className="text-xs text-muted-foreground">
							<Trans>
								Cloud agents get no MCP servers in this environment.
							</Trans>
						</span>
					</div>
					<Switch
						checked={!enabled}
						id="environment-mcp-disabled"
						onCheckedChange={(disabled) => onEnabledChange(!disabled)}
					/>
				</div>
				{enabled && (
					<div className="flex items-center justify-between gap-4 px-3 py-2">
						<span className="text-sm">
							<Trans>Allowed plugins</Trans>
						</span>
						<Select
							onValueChange={(mode) =>
								onChange(
									mode === "all" ? null : options.map((option) => option.entry),
								)
							}
							value={value === null ? "all" : "selected"}
						>
							<SelectTrigger
								aria-label={t({ message: "Allowed plugins" })}
								className="gap-1.5 text-xs"
								size="sm"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">
									<Trans>All plugins</Trans>
								</SelectItem>
								<SelectItem value="selected">
									<Trans>Only the plugins below</Trans>
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
				)}
				{enabled &&
					value !== null &&
					(options.length === 0 && !isLoading ? (
						<p className="px-3 py-2.5 text-xs text-muted-foreground">
							<Trans>
								No plugins installed, so cloud agents get no MCP servers here.
							</Trans>
						</p>
					) : (
						options.map((option) => {
							const id = `environment-mcp-${option.entry}`;
							return (
								<label
									className="flex h-9 cursor-pointer items-center gap-2.5 px-3 text-sm"
									htmlFor={id}
									key={option.entry}
								>
									<Checkbox
										checked={allowed.has(option.entry)}
										id={id}
										onCheckedChange={(checked) =>
											onChange(
												checked === true
													? [...(value ?? []), option.entry]
													: (value ?? []).filter(
															(entry) => entry !== option.entry,
														),
											)
										}
									/>
									<span className="truncate">{option.label}</span>
									{option.marketplace && (
										<span className="ml-auto text-xs text-muted-foreground">
											{option.marketplace}
										</span>
									)}
								</label>
							);
						})
					))}
			</div>
		</div>
	);
}
