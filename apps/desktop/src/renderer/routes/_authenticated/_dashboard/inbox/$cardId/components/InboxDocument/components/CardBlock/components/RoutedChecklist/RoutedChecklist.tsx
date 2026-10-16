import { useState } from "react";
import { SlackWorkspaceProvider } from "../../providers/SlackWorkspaceProvider";
import type { RoutedItemView, SlackComposeContextView } from "../../types";
import { RoutedRow } from "./components/RoutedRow";
import type { RoutedEntry, RoutedValue } from "./utils/routedValue";

interface RoutedChecklistProps {
	items: RoutedItemView[];
	/** For the Slack rows' message box; null when no row goes to Slack. */
	compose: SlackComposeContextView | null;
	value: RoutedValue;
	/** Takes an update of the current value, because several editors can report in one tick. */
	onChange: (update: (current: RoutedValue) => RoutedValue) => void;
	disabled?: boolean;
}

const UNSET: RoutedEntry = { checked: false, payload: null };

/** A checklist where each line has a destination: check what should go, open a line to change what it sends. Space checks the focused line and Enter opens it. */
export function RoutedChecklist({
	items,
	compose,
	value,
	onChange,
	disabled,
}: RoutedChecklistProps) {
	const [expanded, setExpanded] = useState<string | null>(null);
	const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
	const patch = (id: string, change: Partial<RoutedEntry>) =>
		onChange((current) => ({
			...current,
			[id]: { ...(current[id] ?? UNSET), ...change },
		}));
	return (
		<SlackWorkspaceProvider
			people={compose?.members}
			names={compose?.names}
			channels={compose?.channels}
			groups={compose?.groups}
			emoji={compose?.emoji}
		>
			<ul className="flex flex-col divide-y divide-border">
				{items.map((item) => (
					<RoutedRow
						key={item.id}
						item={item}
						entry={value[item.id] ?? UNSET}
						compose={compose}
						expanded={expanded === item.id}
						opened={opened.has(item.id)}
						disabled={disabled}
						onCheck={(checked) => patch(item.id, { checked })}
						onExpand={() => {
							setExpanded((current) => (current === item.id ? null : item.id));
							setOpened((current) => new Set(current).add(item.id));
						}}
						onPayload={(payload) => patch(item.id, { payload })}
					/>
				))}
			</ul>
		</SlackWorkspaceProvider>
	);
}
