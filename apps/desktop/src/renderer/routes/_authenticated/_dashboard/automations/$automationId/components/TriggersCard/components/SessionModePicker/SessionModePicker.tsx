import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { ChipButton } from "../../../../../components/TriggerSentence/components/ChipButton";

/**
 * Whether each run starts its own agent conversation or picks up the one the
 * previous run left. Only rendered when runs share a workspace.
 */
export function SessionModePicker({
	continueAgentSession,
	disabled,
	onChange,
	className,
}: {
	continueAgentSession: boolean;
	disabled?: boolean;
	onChange: (continueAgentSession: boolean) => void;
	className?: string;
}) {
	const label = i18n._(
		continueAgentSession
			? msg({ message: "Continue", context: "automation session mode" })
			: msg({ message: "Start fresh" }),
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<span>
					<ChipButton
						label={label}
						empty={!continueAgentSession}
						disabled={disabled}
						className={className}
					/>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				<DropdownMenuRadioGroup
					value={continueAgentSession ? "continue" : "fresh"}
					onValueChange={(value) => onChange(value === "continue")}
				>
					<DropdownMenuRadioItem value="fresh">
						<span className="flex flex-col">
							<span>{i18n._(msg({ message: "Start fresh" }))}</span>
							<span className="text-xs text-muted-foreground">
								{i18n._(
									msg({ message: "Each run starts a new agent conversation" }),
								)}
							</span>
						</span>
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="continue">
						<span className="flex flex-col">
							<span>
								{i18n._(
									msg({
										message: "Continue",
										context: "automation session mode",
									}),
								)}
							</span>
							<span className="text-xs text-muted-foreground">
								{i18n._(
									msg({
										message: "The agent picks up where the last run left off",
									}),
								)}
							</span>
						</span>
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
