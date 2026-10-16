import { useLingui } from "@lingui/react/macro";
import { LuChevronsDownUp, LuChevronsUpDown, LuPrinter } from "react-icons/lu";
import type { GmailLabelView } from "../../types";
import { HeaderIconButton } from "./components/HeaderIconButton";
import { LabelChip } from "./components/LabelChip";

const SHOWN_SYSTEM_LABELS = new Set(["INBOX", "SPAM", "TRASH"]);

interface ThreadHeaderProps {
	subject: string;
	labels: GmailLabelView[];
	printUrl: string;
	onRemoveLabel?: (labelId: string) => void;
	/** Absent for a single message, where Gmail has no expand-all. */
	onToggleExpanded?: () => void;
	expanded?: boolean;
}

function isUserLabel(label: GmailLabelView): boolean {
	return label.id.startsWith("Label_");
}

/** The subject with its labels and the expand and print buttons. */
export function ThreadHeader({
	subject,
	labels,
	printUrl,
	onRemoveLabel,
	onToggleExpanded,
	expanded,
}: ThreadHeaderProps) {
	const { t } = useLingui();
	const systemName: Record<string, string> = {
		INBOX: t({ message: "Inbox", context: "Gmail label" }),
		SPAM: t({ message: "Spam", context: "Gmail label" }),
		TRASH: t({ message: "Trash", context: "Gmail label" }),
	};
	const shown = labels.filter(
		(label) => isUserLabel(label) || SHOWN_SYSTEM_LABELS.has(label.id),
	);
	return (
		<div className="px-4 pt-2">
			<div className="flex items-start gap-2 py-1.5">
				<h2 className="min-w-0 flex-1 py-1.5 pl-14 text-[22px] leading-7 font-normal text-foreground">
					<span className="mr-2 break-words">{subject}</span>
					{shown.map((label) => {
						const removable =
							onRemoveLabel && (isUserLabel(label) || label.id === "INBOX");
						return (
							<span
								key={label.id}
								className="mr-1.5 inline-block -translate-y-0.5"
							>
								<LabelChip
									label={label}
									name={systemName[label.id] ?? label.name}
									onRemove={
										removable ? () => onRemoveLabel(label.id) : undefined
									}
								/>
							</span>
						);
					})}
				</h2>
				<div className="flex shrink-0 items-center">
					{onToggleExpanded && (
						<HeaderIconButton
							label={
								expanded
									? t({ message: "Collapse all" })
									: t({ message: "Expand all" })
							}
							onClick={onToggleExpanded}
						>
							{expanded ? (
								<LuChevronsDownUp className="size-5" />
							) : (
								<LuChevronsUpDown className="size-5" />
							)}
						</HeaderIconButton>
					)}
					<HeaderIconButton label={t({ message: "Print all" })} href={printUrl}>
						<LuPrinter className="size-5" />
					</HeaderIconButton>
				</div>
			</div>
		</div>
	);
}
