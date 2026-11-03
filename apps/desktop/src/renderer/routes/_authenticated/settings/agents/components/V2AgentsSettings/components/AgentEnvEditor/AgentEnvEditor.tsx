import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { areEnvMapsEqual } from "renderer/lib/agent-launch-command";

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface EnvRow {
	id: string;
	key: string;
	value: string;
	saved: { key: string; value: string } | null;
}

function toRows(env: Record<string, string>): EnvRow[] {
	return Object.entries(env).map(([key, value]) => ({
		id: crypto.randomUUID(),
		key,
		value,
		saved: { key, value },
	}));
}

function envIdentity(env: Record<string, string>): string {
	return JSON.stringify(
		Object.entries(env).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
	);
}

function acceptedRowIds(rows: readonly EnvRow[]): Set<string> {
	const seenKeys = new Set<string>();
	const ids = new Set<string>();
	for (const row of rows) {
		const key = row.key.trim();
		if (!ENV_KEY.test(key) || seenKeys.has(key)) continue;
		seenKeys.add(key);
		ids.add(row.id);
	}
	return ids;
}

/** Rows whose name is not accepted keep their last saved entry. */
function toEnv(rows: readonly EnvRow[]): Record<string, string> {
	const accepted = acceptedRowIds(rows);
	const entries = new Map<string, string>();
	for (const row of rows) {
		if (accepted.has(row.id)) entries.set(row.key.trim(), row.value);
	}
	for (const row of rows) {
		if (!accepted.has(row.id) && row.saved && !entries.has(row.saved.key)) {
			entries.set(row.saved.key, row.saved.value);
		}
	}
	return Object.fromEntries(entries);
}

interface AgentEnvEditorProps {
	idPrefix: string;
	env: Record<string, string>;
	onCommit: (env: Record<string, string>, onSaved: () => void) => void;
}

export function AgentEnvEditor({
	idPrefix,
	env,
	onCommit,
}: AgentEnvEditorProps) {
	const { t } = useLingui();
	const variableNameLabel = t({ message: "Variable name" });
	const variableValueLabel = t({ message: "Variable value" });
	const [rows, setRows] = useState(() => toRows(env));
	const committedEnvs = useRef(new Set<string>());
	const accepted = acceptedRowIds(rows);

	useEffect(() => {
		if (committedEnvs.current.has(envIdentity(env))) return;
		committedEnvs.current.clear();
		setRows((current) =>
			areEnvMapsEqual(toEnv(current), env) ? current : toRows(env),
		);
	}, [env]);

	const commit = (next: readonly EnvRow[]) => {
		const nextEnv = toEnv(next);
		const nextAccepted = acceptedRowIds(next);
		committedEnvs.current.add(envIdentity(nextEnv));
		onCommit(nextEnv, () =>
			setRows((current) =>
				current.map((row) => {
					const sent = next.find((candidate) => candidate.id === row.id);
					const unchanged =
						sent && sent.key === row.key && sent.value === row.value;
					return unchanged && nextAccepted.has(row.id)
						? { ...row, saved: { key: row.key.trim(), value: row.value } }
						: row;
				}),
			),
		);
	};

	const isInvalid = (row: EnvRow) =>
		!accepted.has(row.id) && (row.key.trim().length > 0 || row.saved !== null);

	const updateRow = (id: string, patch: Partial<EnvRow>) =>
		setRows((current) =>
			current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
		);

	const removeRow = (id: string) => {
		const next = rows.filter((row) => row.id !== id);
		setRows(next);
		commit(next);
	};

	const addRow = () =>
		setRows((current) => [
			...current,
			{ id: crypto.randomUUID(), key: "", value: "", saved: null },
		]);

	return (
		<div className="space-y-2">
			<p className="text-xs text-muted-foreground">
				<Trans>
					Set when this agent launches, e.g. <code>CLAUDE_CONFIG_DIR</code> to
					use another Claude login.
				</Trans>
			</p>
			{rows.length === 0 ? (
				<p className="rounded-md border border-border/70 px-3 py-2 text-xs text-muted-foreground">
					<Trans>No variables set yet.</Trans>
				</p>
			) : (
				rows.map((row) => (
					<div key={row.id} className="flex items-center gap-2">
						<Input
							id={`${idPrefix}-env-key-${row.id}`}
							className="w-2/5 font-mono text-xs"
							value={row.key}
							onChange={(e) => updateRow(row.id, { key: e.target.value })}
							onBlur={() => commit(rows)}
							aria-label={variableNameLabel}
							aria-invalid={isInvalid(row)}
							placeholder={variableNameLabel}
							spellCheck={false}
						/>
						<Input
							id={`${idPrefix}-env-value-${row.id}`}
							className="flex-1 font-mono text-xs"
							value={row.value}
							onChange={(e) => updateRow(row.id, { value: e.target.value })}
							onBlur={() => commit(rows)}
							aria-label={variableValueLabel}
							placeholder={variableValueLabel}
							spellCheck={false}
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							onClick={() => removeRow(row.id)}
							aria-label={t({ message: "Remove variable" })}
						>
							<X className="size-3.5" />
						</Button>
					</div>
				))
			)}
			<Button
				type="button"
				variant="outline"
				size="xs"
				onClick={addRow}
				className="gap-1.5"
			>
				<Plus className="size-3.5" />
				<Trans>Add variable</Trans>
			</Button>
		</div>
	);
}
