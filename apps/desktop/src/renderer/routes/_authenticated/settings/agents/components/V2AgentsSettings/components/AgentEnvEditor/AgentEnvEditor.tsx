import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Plus, X } from "lucide-react";
import {
	type Dispatch,
	type Ref,
	type SetStateAction,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
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

/** Rows that keep their saved name claim it before renamed or new rows. */
function acceptedRowIds(rows: readonly EnvRow[]): Set<string> {
	const takenKeys = new Set<string>();
	const ids = new Set<string>();
	const accept = (row: EnvRow) => {
		const key = row.key.trim();
		if (ids.has(row.id) || !ENV_KEY.test(key) || takenKeys.has(key)) return;
		takenKeys.add(key);
		ids.add(row.id);
	};
	for (const row of rows) if (row.saved?.key === row.key.trim()) accept(row);
	for (const row of rows) accept(row);
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

function markSaved(rows: EnvRow[], submitted: readonly EnvRow[]): EnvRow[] {
	const accepted = acceptedRowIds(submitted);
	return rows.map((row) => {
		const sent = submitted.find((candidate) => candidate.id === row.id);
		return sent && accepted.has(row.id)
			? { ...row, saved: { key: sent.key.trim(), value: sent.value } }
			: row;
	});
}

function withAssignments(
	rows: readonly EnvRow[],
	assignments: Record<string, string>,
): EnvRow[] {
	const remaining = new Map(Object.entries(assignments));
	const updated = rows.map((row) => {
		const key = row.key.trim();
		if (!remaining.has(key)) return row;
		const value = remaining.get(key) ?? "";
		remaining.delete(key);
		return { ...row, value };
	});
	const added = [...remaining].map(([key, value]) => ({
		id: crypto.randomUUID(),
		key,
		value,
		saved: null,
	}));
	return [...updated, ...added];
}

interface SaveState {
	inFlight: boolean;
	queued: boolean;
	lastSent: Record<string, string>;
	sentInBurst: Set<string>;
	external: Record<string, string> | null;
}

function applyExternal(
	state: SaveState,
	setRows: Dispatch<SetStateAction<EnvRow[]>>,
	external: Record<string, string>,
) {
	state.lastSent = external;
	state.sentInBurst.clear();
	setRows((current) =>
		areEnvMapsEqual(toEnv(current), external) ? current : toRows(external),
	);
}

export interface AgentEnvEditorHandle {
	/** Sets variables, e.g. inline `VAR=value` prefixes from the command field. */
	assign: (assignments: Record<string, string>) => void;
}

interface AgentEnvEditorProps {
	idPrefix: string;
	env: Record<string, string>;
	onCommit: (env: Record<string, string>) => Promise<unknown>;
	ref?: Ref<AgentEnvEditorHandle>;
}

export function AgentEnvEditor({
	idPrefix,
	env,
	onCommit,
	ref,
}: AgentEnvEditorProps) {
	const { t } = useLingui();
	const variableNameLabel = t({ message: "Variable name" });
	const variableValueLabel = t({ message: "Variable value" });
	const [rows, setRows] = useState(() => toRows(env));
	const rowsRef = useRef(rows);
	rowsRef.current = rows;
	const saves = useRef<SaveState>({
		inFlight: false,
		queued: false,
		lastSent: env,
		sentInBurst: new Set(),
		external: null,
	});
	const accepted = acceptedRowIds(rows);

	useEffect(() => {
		const state = saves.current;
		const isOwnEcho =
			areEnvMapsEqual(env, state.lastSent) ||
			state.sentInBurst.has(envIdentity(env));
		if (isOwnEcho) return;
		if (state.inFlight) state.external = env;
		else applyExternal(state, setRows, env);
	}, [env]);

	const send = (submitted: readonly EnvRow[]) => {
		const state = saves.current;
		const nextEnv = toEnv(submitted);
		if (areEnvMapsEqual(nextEnv, state.lastSent)) {
			setRows((current) => markSaved(current, submitted));
			return;
		}
		const previous = state.lastSent;
		state.inFlight = true;
		state.lastSent = nextEnv;
		state.sentInBurst.add(envIdentity(nextEnv));
		onCommit(nextEnv)
			.then(
				() => setRows((current) => markSaved(current, submitted)),
				() => {
					state.lastSent = previous;
				},
			)
			.finally(() => {
				state.inFlight = false;
				const { external, queued } = state;
				state.external = null;
				state.queued = false;
				if (external) applyExternal(state, setRows, external);
				else if (queued) send(rowsRef.current);
			});
	};

	const commit = (next: readonly EnvRow[]) => {
		if (saves.current.inFlight) {
			saves.current.queued = true;
			return;
		}
		saves.current.sentInBurst.clear();
		send(next);
	};

	useImperativeHandle(ref, () => ({
		assign: (assignments) => {
			const next = withAssignments(rowsRef.current, assignments);
			rowsRef.current = next;
			setRows(next);
			commit(next);
		},
	}));

	const isInvalid = (row: EnvRow) =>
		!accepted.has(row.id) && (row.key.trim().length > 0 || row.saved !== null);

	const updateRow = (id: string, patch: Partial<EnvRow>) =>
		setRows((current) =>
			current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
		);

	const removeRow = (id: string) => {
		const next = rows.filter((row) => row.id !== id);
		rowsRef.current = next;
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
