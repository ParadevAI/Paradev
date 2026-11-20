import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Switch } from "@superset/ui/switch";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { PLACEHOLDERS } from "../../constants";
import {
	nextRowKey,
	type PortRow,
	type RowProblem,
} from "../../utils/configForm";
import { RowProblemText } from "../RowProblemText";

interface PortsFieldProps {
	rows: PortRow[];
	problems: Map<string, RowProblem>;
	onChange: (rows: PortRow[]) => void;
}

export function PortsField({ rows, problems, onChange }: PortsFieldProps) {
	const { t } = useLingui();

	const edit = (key: string, patch: Partial<PortRow>) =>
		onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

	return (
		<div className="flex flex-col gap-1.5 p-3">
			<div className="flex items-center justify-between gap-4">
				<span className="text-xs font-medium">
					<Trans>Ports</Trans>
				</span>
				<Button
					onClick={() =>
						onChange([
							...rows,
							{
								key: nextRowKey(),
								name: "",
								port: "",
								label: "",
								preview: false,
							},
						])
					}
					size="xs"
					variant="ghost"
				>
					<LuPlus />
					<Trans>Add port</Trans>
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">
				<Trans>
					Ports the app listens on. Preview ports get a link you can open from
					the workspace.
				</Trans>
			</p>
			{rows.length > 0 && (
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2 text-[11px] text-muted-foreground">
						<span className="w-32 shrink-0">
							<Trans>Name</Trans>
						</span>
						<span className="w-24 shrink-0">
							<Trans>Port</Trans>
						</span>
						<span className="flex-1">
							<Trans>Label</Trans>
						</span>
						<span className="w-14 shrink-0 text-center">
							<Trans>Preview</Trans>
						</span>
						<span className="w-7 shrink-0" />
					</div>
					{rows.map((row) => (
						<div className="flex flex-col gap-1" key={row.key}>
							<div className="flex items-center gap-2">
								<Input
									aria-invalid={
										problems.get(row.key) === "name" ||
										problems.get(row.key) === "duplicate"
									}
									aria-label={t({ message: "Port name" })}
									className="h-8 w-32 shrink-0 font-mono text-xs md:text-xs"
									onChange={(event) =>
										edit(row.key, { name: event.target.value })
									}
									placeholder={PLACEHOLDERS.portName}
									spellCheck={false}
									value={row.name}
								/>
								<Input
									aria-invalid={problems.get(row.key) === "port"}
									aria-label={t({ message: "Port number" })}
									className="h-8 w-24 shrink-0 font-mono text-xs md:text-xs"
									inputMode="numeric"
									onChange={(event) =>
										edit(row.key, { port: event.target.value })
									}
									placeholder={PLACEHOLDERS.port}
									value={row.port}
								/>
								<Input
									aria-label={t({ message: "Port label" })}
									className="h-8 flex-1 text-xs md:text-xs"
									onChange={(event) =>
										edit(row.key, { label: event.target.value })
									}
									placeholder={t({ message: "Web app" })}
									value={row.label}
								/>
								<div className="flex w-14 shrink-0 justify-center">
									<Switch
										aria-label={t({ message: "Preview" })}
										checked={row.preview}
										onCheckedChange={(preview) => edit(row.key, { preview })}
									/>
								</div>
								<Button
									aria-label={t({ message: "Remove port" })}
									className="text-muted-foreground"
									onClick={() =>
										onChange(rows.filter((other) => other.key !== row.key))
									}
									size="icon-xs"
									variant="ghost"
								>
									<LuTrash2 />
								</Button>
							</div>
							<RowProblemText problem={problems.get(row.key)} />
						</div>
					))}
				</div>
			)}
		</div>
	);
}
