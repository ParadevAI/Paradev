import { useEffect, useRef, useState } from "react";
import type {
	LinearFieldsView,
	LinearOptionsView,
	LinearStateView,
} from "../../types";
import { type IssueFieldKey, sameField } from "../../utils/linearFields";
import { FieldPicker } from "../FieldPicker";
import { type Suggestion, SuggestionChips } from "../SuggestionChips";
import { useFieldModels } from "./hooks/useFieldModels";

interface IssueFieldsProps<Fields extends Partial<LinearFieldsView>> {
	value: Fields;
	options: LinearOptionsView;
	onChange: (next: Fields) => void;
	/** Drawn as Linear's dashed "Quick suggestions" chips; a click applies one. */
	suggested?: Partial<LinearFieldsView>;
	/** What the issue holds: a chip whose value differs shows old → new. */
	baseline?: Partial<LinearFieldsView>;
	/** The issue's own status, when the status menu does not offer it. */
	issueState?: LinearStateView;
	/** Names the team in the project menu's first section. */
	teamName?: string;
	/** The value holds only the properties to change: an explicit none reads "No assignee", and labels are ones to add. */
	sparse?: boolean;
	disabled?: boolean;
	show?: readonly IssueFieldKey[];
}

const TEXT_FIELD = "input, textarea, select, [contenteditable='true']";

/**
 * Linear's property row: status, priority, assignee, project, estimate, labels
 * and cycle, each a chip that opens its menu. S, P, A, L, ⇧C, ⇧P and ⇧E open
 * them while focus is in the card and not in a text field. A value that lacks
 * a property leaves it untouched.
 */
export function IssueFields<Fields extends Partial<LinearFieldsView>>({
	value,
	options,
	onChange,
	suggested,
	baseline,
	issueState,
	teamName,
	sparse = false,
	disabled,
	show,
}: IssueFieldsProps<Fields>) {
	const root = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState<IssueFieldKey | null>(null);
	const models = useFieldModels({
		value,
		options,
		issueState,
		teamName,
		sparse,
	}).filter((model) => !show || show.includes(model.key));

	const shortcuts = useRef(models);
	shortcuts.current = models;
	const blocked = useRef(false);
	blocked.current = Boolean(disabled) || open !== null;
	useEffect(() => {
		const scope =
			root.current?.closest<HTMLElement>("[data-linear-card]") ?? root.current;
		if (!scope) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (blocked.current) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if ((event.target as Element | null)?.closest?.(TEXT_FIELD)) return;
			const model = shortcuts.current.find(
				(item) =>
					item.shift === event.shiftKey &&
					item.shortcut.slice(-1).toLowerCase() === event.key.toLowerCase(),
			);
			if (!model) return;
			event.preventDefault();
			setOpen(model.key);
		};
		scope.addEventListener("keydown", onKeyDown);
		return () => scope.removeEventListener("keydown", onKeyDown);
	}, []);

	const suggestions: Suggestion[] = models.flatMap((model) => {
		if (!suggested || suggested[model.key] === undefined) return [];
		if (model.key === "labels")
			return (suggested.labels ?? [])
				.filter((id) => !value.labels?.includes(id))
				.map((id) => {
					const face = model.face({ labels: [id] });
					return {
						id: `labels:${id}`,
						icon: face.icon,
						text: face.text,
						apply: () => onChange(model.pick(value, id) as Fields),
					};
				});
		if (sameField(model.key, suggested, value)) return [];
		const face = model.face(suggested);
		return [
			{
				id: model.key,
				icon: face.icon,
				text: face.text,
				apply: () => onChange({ ...value, [model.key]: suggested[model.key] }),
			},
		];
	});

	return (
		<div ref={root} className="flex flex-col gap-2.5">
			<SuggestionChips suggestions={suggestions} disabled={disabled} />
			<div className="flex flex-wrap items-center gap-1.5">
				{models.map((model) => (
					<FieldPicker
						key={model.key}
						model={model}
						face={model.face(value)}
						was={
							baseline &&
							value[model.key] !== undefined &&
							!sameField(model.key, baseline, value)
								? model.face(baseline)
								: undefined
						}
						open={open === model.key}
						onOpenChange={(next) => setOpen(next ? model.key : null)}
						onPick={(id) => onChange(model.pick(value, id) as Fields)}
						disabled={disabled}
					/>
				))}
			</div>
		</div>
	);
}
