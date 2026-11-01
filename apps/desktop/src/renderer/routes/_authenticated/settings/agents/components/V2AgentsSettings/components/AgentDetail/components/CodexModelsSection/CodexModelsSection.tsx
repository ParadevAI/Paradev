import { Trans } from "@lingui/react/macro";
import { codexPickerModels } from "@superset/shared/agent-models";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useMemo } from "react";
import {
	AGENT_MODEL_CATALOG_QUERY_KEY,
	useAgentModelCatalogs,
} from "renderer/hooks/useAgentModelCatalogs";
import { useCodexModels } from "renderer/stores/codex-models/store";

export function CodexModelsSection({
	agentId,
	hostUrl,
}: {
	agentId: string;
	hostUrl: string | null;
}) {
	const fieldId = useId();
	const agents = useMemo(
		() => [{ id: agentId, launchPresetId: "codex" }],
		[agentId],
	);
	const { rawCatalogs, isPending, error } = useAgentModelCatalogs(
		hostUrl,
		agents,
	);
	const models = rawCatalogs[agentId]?.models ?? [];
	const selectedIds = useCodexModels((state) => state.selectedIds);
	const setSelectedIds = useCodexModels((state) => state.setSelectedIds);
	const selected = codexPickerModels(models, selectedIds);
	const client = useQueryClient();
	return (
		<section className="space-y-3 border-t pt-6">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-medium">
					<Trans>Codex models</Trans>
				</h3>
				<Button
					variant="outline"
					size="sm"
					disabled={isPending || !hostUrl}
					onClick={() =>
						void client.invalidateQueries({
							queryKey: AGENT_MODEL_CATALOG_QUERY_KEY,
						})
					}
				>
					<Trans>Refresh</Trans>
				</Button>
			</div>
			<p className="text-sm text-muted-foreground">
				<Trans>
					Choose which models appear in the model picker. Keep at least one
					selected.
				</Trans>
			</p>
			{isPending ? (
				<output>
					<Trans>Loading Codex models…</Trans>
				</output>
			) : error ? (
				<p role="alert" className="text-sm text-destructive">
					<Trans>
						Could not load Codex models. Check the agent account, then refresh.
					</Trans>
				</p>
			) : models.length === 0 ? (
				<output>
					<Trans>
						No Codex models available. Check the agent account in Settings.
					</Trans>
				</output>
			) : (
				models.map((model) => {
					const checked = selected.some((option) => option.id === model.id);
					return (
						<label
							htmlFor={`${fieldId}-${model.id}`}
							key={model.id}
							className="flex items-center gap-3 text-sm"
						>
							<Checkbox
								id={`${fieldId}-${model.id}`}
								checked={checked}
								disabled={checked && selected.length === 1}
								onCheckedChange={(value) =>
									setSelectedIds(
										value
											? [...selected.map((option) => option.id), model.id]
											: selected
													.filter((option) => option.id !== model.id)
													.map((option) => option.id),
									)
								}
							/>
							<span>
								{model.label}
								<span className="ml-2 text-xs text-muted-foreground">
									{model.id}
								</span>
							</span>
							{model.isDefault && (
								<span className="text-xs text-muted-foreground">
									<Trans>Recommended</Trans>
								</span>
							)}
							{model.hidden && (
								<span className="text-xs text-muted-foreground">
									<Trans>Hidden by Codex</Trans>
								</span>
							)}
						</label>
					);
				})
			)}
		</section>
	);
}
