import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/utils";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { PLACEHOLDERS } from "../../constants";
import {
	nextRowKey,
	type RowProblem,
	type TerminalRow,
} from "../../utils/configForm";
import { RowProblemText } from "../RowProblemText";

interface TerminalsFieldProps {
	rows: TerminalRow[];
	problems: Map<string, RowProblem>;
	onChange: (rows: TerminalRow[]) => void;
}

export function TerminalsField({
	rows,
	problems,
	onChange,
}: TerminalsFieldProps) {
	const { t } = useLingui();

	const edit = (key: string, patch: Partial<TerminalRow>) =>
		onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

	return (
		<div className="flex flex-col gap-1.5 p-3">
			<div className="flex items-center justify-between gap-4">
				<span className="text-xs font-medium">
					<Trans>Terminals</Trans>
				</span>
				<Button
					onClick={() =>
						onChange([
							...rows,
							{
								key: nextRowKey(),
								source: null,
								name: "",
								command: "",
								originalCommand: "",
								isDefault: rows.length === 0,
							},
						])
					}
					size="xs"
					variant="ghost"
				>
					<LuPlus />
					<Trans>Add terminal</Trans>
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">
				<Trans>
					Long-running commands, such as a dev server. Each workspace opens the
					default one when it starts.
				</Trans>
			</p>
			{rows.length > 0 && (
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2 text-[11px] text-muted-foreground">
						<span className="w-32 shrink-0">
							<Trans>Name</Trans>
						</span>
						<span className="flex-1">
							<Trans>Command</Trans>
						</span>
						<span className="w-14 shrink-0 text-center">
							<Trans>Default</Trans>
						</span>
						<span className="w-7 shrink-0" />
					</div>
					{rows.map((row) => {
						const terminalName = row.name.trim();
						return (
							<div className="flex flex-col gap-1" key={row.key}>
								<div className="flex items-center gap-2">
									<Input
										aria-invalid={
											problems.get(row.key) === "name" ||
											problems.get(row.key) === "duplicate"
										}
										aria-label={t({ message: "Terminal name" })}
										className="h-8 w-32 shrink-0 font-mono text-xs md:text-xs"
										onChange={(event) =>
											edit(row.key, { name: event.target.value })
										}
										placeholder={PLACEHOLDERS.terminalName}
										spellCheck={false}
										value={row.name}
									/>
									<Input
										aria-invalid={problems.get(row.key) === "command"}
										aria-label={t({ message: "Terminal command" })}
										className="h-8 flex-1 font-mono text-xs md:text-xs"
										onChange={(event) =>
											edit(row.key, { command: event.target.value })
										}
										placeholder={PLACEHOLDERS.terminalCommand}
										spellCheck={false}
										value={row.command}
									/>
									<div className="flex w-14 shrink-0 justify-center">
										<button
											aria-label={
												terminalName
													? t({ message: `Default terminal: ${terminalName}` })
													: t({ message: "Default terminal" })
											}
											aria-pressed={row.isDefault}
											className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
											onClick={() =>
												onChange(
													rows.map((other) => ({
														...other,
														isDefault: other.key === row.key,
													})),
												)
											}
											type="button"
										>
											<span
												className={cn(
													"size-2 rounded-full bg-primary",
													!row.isDefault && "invisible",
												)}
											/>
										</button>
									</div>
									<Button
										aria-label={
											terminalName
												? t({ message: `Remove terminal ${terminalName}` })
												: t({ message: "Remove terminal" })
										}
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
						);
					})}
				</div>
			)}
		</div>
	);
}
