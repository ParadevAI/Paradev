import type { TerminalPreset } from "@superset/local-db";
import {
	AGENT_LABELS,
	AGENT_TYPES,
	type AgentType,
} from "@superset/shared/agent-command";
import { useState } from "react";
import { LuTerminal } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { ImportPageShell } from "../components/ImportPageShell";
import { ImportRow, type RowAction } from "../components/ImportRow";

interface ImportPresetsPageProps {
	organizationId: string;
}

interface AuditLogEntry {
	v2Id: string | null;
	status: string;
	reason: string | null;
}

const BUILTIN_AGENT_IDS = new Set<string>(AGENT_TYPES);

export function ImportPresetsPage({ organizationId }: ImportPresetsPageProps) {
	const presetsQuery = electronTrpc.settings.getTerminalPresets.useQuery();
	const auditQuery = electronTrpc.migration.listState.useQuery({
		organizationId,
	});
	const [isRefreshing, setIsRefreshing] = useState(false);

	const isLoading = presetsQuery.isPending || auditQuery.isPending;
	const presets = presetsQuery.data ?? [];

	const auditByV1Id = new Map<string, AuditLogEntry>();
	for (const row of auditQuery.data ?? []) {
		if (row.kind !== "preset") continue;
		auditByV1Id.set(row.v1Id, {
			v2Id: row.v2Id,
			status: row.status,
			reason: row.reason,
		});
	}

	const refresh = async () => {
		setIsRefreshing(true);
		try {
			await Promise.all([presetsQuery.refetch(), auditQuery.refetch()]);
		} finally {
			setIsRefreshing(false);
		}
	};

	return (
		<ImportPageShell
			title="Bring over your terminal presets"
			description="Import each v1 terminal preset into v2."
			isLoading={isLoading}
			itemCount={presets.length}
			emptyMessage="No v1 terminal presets found."
			onRefresh={refresh}
			isRefreshing={isRefreshing}
		>
			{presets.map((preset, index) => (
				<PresetRow
					key={preset.id}
					preset={preset}
					tabOrder={index}
					audit={auditByV1Id.get(preset.id)}
					organizationId={organizationId}
				/>
			))}
		</ImportPageShell>
	);
}

interface PresetRowProps {
	preset: TerminalPreset;
	tabOrder: number;
	audit: AuditLogEntry | undefined;
	organizationId: string;
}

function PresetRow({
	preset,
	tabOrder,
	audit,
	organizationId,
}: PresetRowProps) {
	const collections = useCollections();
	const upsertState = electronTrpc.migration.upsertState.useMutation();
	const trpcUtils = electronTrpc.useUtils();
	const [running, setRunning] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const auditImported = audit !== undefined && audit.status === "success";
	const auditError =
		audit !== undefined && audit.status === "error" ? audit.reason : null;

	const runImport = async () => {
		setRunning(true);
		setErrorMessage(null);
		try {
			const linkedAgentId: AgentType | undefined = BUILTIN_AGENT_IDS.has(
				preset.name,
			)
				? (preset.name as AgentType)
				: undefined;

			// Reuse the audit row's v2Id when present so a retry after a
			// partial failure (insert succeeded, audit upsert failed) doesn't
			// create a duplicate v2 preset row. Insert is upsert-by-id, so
			// re-running with the same id is a no-op.
			const v2Id = audit?.v2Id ?? crypto.randomUUID();
			const row: V2TerminalPresetRow = {
				id: v2Id,
				name: linkedAgentId ? AGENT_LABELS[linkedAgentId] : preset.name,
				description: preset.description,
				cwd: preset.cwd,
				commands: preset.commands,
				projectIds: preset.projectIds ?? null,
				pinnedToBar: preset.pinnedToBar,
				applyOnWorkspaceCreated: preset.applyOnWorkspaceCreated,
				applyOnNewTab: preset.applyOnNewTab,
				executionMode: preset.executionMode ?? "new-tab",
				tabOrder,
				createdAt: new Date(),
				agentId: linkedAgentId,
			};
			collections.v2TerminalPresets.insert(row);

			await upsertState.mutateAsync({
				v1Id: preset.id,
				kind: "preset",
				v2Id,
				organizationId,
				status: "success",
				reason: null,
			});

			await trpcUtils.migration.listState.invalidate({ organizationId });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setErrorMessage(message);
			await upsertState
				.mutateAsync({
					v1Id: preset.id,
					kind: "preset",
					v2Id: null,
					organizationId,
					status: "error",
					reason: message,
				})
				.catch((auditErr) => {
					console.warn(
						"[v1-import] failed to record preset import error in audit",
						{ presetId: preset.id, auditErr },
					);
				});
			await trpcUtils.migration.listState.invalidate({ organizationId });
		} finally {
			setRunning(false);
		}
	};

	const action: RowAction = (() => {
		if (running) return { kind: "running" };
		if (auditImported) return { kind: "imported" };
		if (errorMessage) {
			return { kind: "error", message: errorMessage, onRetry: runImport };
		}
		if (auditError) {
			return { kind: "error", message: auditError, onRetry: runImport };
		}
		return { kind: "ready", label: "Import", onClick: runImport };
	})();

	return (
		<ImportRow
			icon={<LuTerminal className="size-3.5" strokeWidth={2} />}
			primary={preset.name}
			secondary={preset.description ?? preset.commands[0]}
			action={action}
		/>
	);
}
