import { useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import {
	LuBox,
	LuCirclePlay,
	LuCircleUserRound,
	LuPlus,
	LuTag,
	LuTriangle,
} from "react-icons/lu";
import { PriorityIcon } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/PriorityIcon";
import { usePriorityLabels } from "renderer/routes/_authenticated/_dashboard/tasks/hooks/usePriorityLabels";
import type {
	LinearCycleView,
	LinearFieldsView,
	LinearOptionsView,
	LinearStateView,
} from "../../../../types";
import { priorityKey, toggleLabel } from "../../../../utils/linearFields";
import { LinearAvatar } from "../../../LinearAvatar";
import { LinearStateIcon } from "../../../LinearStateIcon";
import type { FieldFace, FieldModel, PickerRow } from "../../types";

const ICON = "size-3.5 shrink-0";
const PRIORITIES = [0, 1, 2, 3, 4];

const Dot = ({ color }: { color: string }) => (
	<span
		className="size-2.5 shrink-0 rounded-full"
		style={{ backgroundColor: color }}
	/>
);

const day = (iso: string) =>
	formatDate(new Date(iso), { month: "short", day: "numeric" });

interface FieldModelsInput {
	value: Partial<LinearFieldsView>;
	options: LinearOptionsView;
	/** The issue's own status, when the picker does not offer it. */
	issueState?: LinearStateView;
	teamName?: string;
	/** The value holds only the properties to change: an explicit none reads "No assignee", and labels are ones to add, which no group limits. */
	sparse: boolean;
}

/** What each chip of the row shows and what its menu offers, in Linear's words. */
export function useFieldModels({
	value,
	options,
	issueState,
	teamName,
	sparse,
}: FieldModelsInput): FieldModel[] {
	const { t } = useLingui();
	const priorityNames = usePriorityLabels();
	const now = Date.now();

	const cycleName = (cycle: LinearCycleView) =>
		cycle.name ?? t({ message: `Cycle ${cycle.number}` });
	const cyclePhase = (cycle: LinearCycleView) => {
		const start = Date.parse(cycle.startsAt);
		if (start <= now && now < Date.parse(cycle.endsAt))
			return t({ message: "Current", context: "cycle" });
		const upcoming = options.cycles.find(
			(other) => Date.parse(other.startsAt) > now,
		);
		return upcoming?.id === cycle.id
			? t({ message: "Upcoming", context: "cycle" })
			: null;
	};
	const none = (
		name: string,
		noneText: string,
		icon: FieldFace["icon"],
		absent: boolean,
	): FieldFace => ({
		icon,
		text: sparse && !absent ? noneText : name,
		empty: true,
	});

	const names = {
		state: t({ message: "Status" }),
		priority: t({ message: "Priority" }),
		assignee: t({ message: "Assignee" }),
		project: t({ message: "Project" }),
		estimate: t({ message: "Estimate" }),
		labels: t({ message: "Labels" }),
		cycle: t({ message: "Cycle" }),
	};
	const noneNames = {
		priority: priorityNames.none,
		assignee: t({ message: "No assignee" }),
		project: t({ message: "No project" }),
		estimate: t({ message: "No estimate" }),
		cycle: t({ message: "No cycle" }),
	};
	const userIcon = <LuCircleUserRound className={ICON} />;
	const projectIcon = <LuBox className={ICON} />;
	const estimateIcon = <LuTriangle className={ICON} />;
	const labelIcon = <LuTag className={ICON} />;
	const cycleIcon = <LuCirclePlay className={ICON} />;
	const priorityIcon = (priority: number) => (
		<PriorityIcon
			priority={priorityKey(priority)}
			statusType="started"
			className="size-3.5"
		/>
	);

	const state: FieldModel = {
		key: "state",
		name: names.state,
		placeholder: t({ message: "Change status…" }),
		shortcut: "S",
		shift: false,
		multi: false,
		rows: options.states.map((item, index) => ({
			id: item.id,
			label: item.name,
			icon: <LinearStateIcon state={item} />,
			hint: index < 9 ? String(index + 1) : undefined,
			checked: value.state === item.id,
		})),
		face: (fields) => {
			const found = [
				...options.states,
				...(issueState ? [issueState] : []),
			].find((item) => item.id === fields.state);
			return found
				? {
						icon: <LinearStateIcon state={found} />,
						text: found.name,
						empty: false,
					}
				: {
						icon: (
							<LinearStateIcon
								state={{ type: "backlog", color: "currentColor" }}
							/>
						),
						text: names.state,
						empty: true,
					};
		},
		pick: (fields, id) => ({ ...fields, state: id }),
	};

	const priority: FieldModel = {
		key: "priority",
		name: names.priority,
		placeholder: t({ message: "Set priority to…" }),
		shortcut: "P",
		shift: false,
		multi: false,
		rows: PRIORITIES.map((level) => ({
			id: String(level),
			label: priorityNames[priorityKey(level)],
			icon: priorityIcon(level),
			hint: String(level),
			checked: value.priority === level,
		})),
		face: (fields) =>
			fields.priority
				? {
						icon: priorityIcon(fields.priority),
						text: priorityNames[priorityKey(fields.priority)],
						empty: false,
					}
				: none(
						names.priority,
						noneNames.priority,
						priorityIcon(0),
						fields.priority === undefined,
					),
		pick: (fields, id) => ({ ...fields, priority: Number(id) }),
	};

	const people = options.members.filter((member) => !member.app);
	const apps = options.members.filter((member) => member.app);
	const assignee: FieldModel = {
		key: "assignee",
		name: names.assignee,
		placeholder: t({ message: "Assign to…" }),
		shortcut: "A",
		shift: false,
		multi: false,
		rows: [
			{
				id: "",
				label: noneNames.assignee,
				icon: userIcon,
				hint: "0",
				checked: value.assignee === null,
			},
			...people.map(
				(member, index): PickerRow => ({
					id: member.id,
					label: member.name,
					icon: <LinearAvatar person={member} className="size-4 text-[9px]" />,
					hint: index < 9 ? String(index + 1) : undefined,
					checked: value.assignee === member.id,
				}),
			),
			...apps.map(
				(member): PickerRow => ({
					id: member.id,
					label: member.name,
					icon: <LinearAvatar person={member} className="size-4 text-[9px]" />,
					checked: value.assignee === member.id,
					section: t({ message: "Other agents" }),
				}),
			),
		],
		face: (fields) => {
			const member = options.members.find(
				(item) => item.id === fields.assignee,
			);
			return member
				? {
						icon: (
							<LinearAvatar person={member} className="size-4 text-[9px]" />
						),
						text: member.name,
						empty: false,
					}
				: none(
						names.assignee,
						noneNames.assignee,
						userIcon,
						fields.assignee === undefined,
					);
		},
		pick: (fields, id) => ({ ...fields, assignee: id || null }),
	};

	const inTeam = teamName
		? t({ message: `Projects in ${teamName} team` })
		: undefined;
	const project: FieldModel = {
		key: "project",
		name: names.project,
		placeholder: t({ message: "Add to project…" }),
		shortcut: "⇧P",
		shift: true,
		multi: false,
		rows: [
			{
				id: "",
				label: noneNames.project,
				icon: projectIcon,
				hint: "0",
				checked: value.project === null,
			},
			...[...options.projects]
				.sort((a, b) => Number(b.inTeam) - Number(a.inTeam))
				.map(
					(item): PickerRow => ({
						id: item.id,
						label: item.name,
						icon: <LuBox className={ICON} style={{ color: item.color }} />,
						checked: value.project === item.id,
						section: item.inTeam ? inTeam : t({ message: "Other projects" }),
					}),
				),
		],
		face: (fields) => {
			const found = options.projects.find((item) => item.id === fields.project);
			return found
				? {
						icon: <LuBox className={ICON} style={{ color: found.color }} />,
						text: found.name,
						empty: false,
					}
				: none(
						names.project,
						noneNames.project,
						projectIcon,
						fields.project === undefined,
					);
		},
		pick: (fields, id) => ({ ...fields, project: id || null }),
	};

	const estimate: FieldModel = {
		key: "estimate",
		name: names.estimate,
		placeholder: t({ message: "Set estimate to…" }),
		shortcut: "⇧E",
		shift: true,
		multi: false,
		rows: [
			{
				id: "",
				label: noneNames.estimate,
				icon: estimateIcon,
				checked: value.estimate === null,
			},
			...options.estimates.map(
				(item): PickerRow => ({
					id: String(item.value),
					label: item.label,
					icon: estimateIcon,
					checked: value.estimate === item.value,
				}),
			),
		],
		face: (fields) =>
			typeof fields.estimate === "number"
				? {
						icon: estimateIcon,
						text:
							options.estimates.find((item) => item.value === fields.estimate)
								?.label ?? String(fields.estimate),
						empty: false,
					}
				: none(
						names.estimate,
						noneNames.estimate,
						estimateIcon,
						fields.estimate === undefined,
					),
		pick: (fields, id) => ({
			...fields,
			estimate: id === "" ? null : Number(id),
		}),
	};

	const labels: FieldModel = {
		key: "labels",
		name: names.labels,
		placeholder: t({ message: "Add labels…" }),
		shortcut: "L",
		shift: false,
		multi: true,
		rows: [...options.labels]
			.sort((a, b) => Number(a.group !== null) - Number(b.group !== null))
			.map((item) => ({
				id: item.id,
				label: item.name,
				icon: <Dot color={item.color} />,
				checked: value.labels?.includes(item.id) ?? false,
				section: item.group ?? undefined,
			})),
		face: (fields) => {
			const chosen = options.labels.filter((item) =>
				fields.labels?.includes(item.id),
			);
			const [first] = chosen;
			if (!first) return { icon: labelIcon, text: names.labels, empty: true };
			const count = chosen.length;
			return {
				icon: (
					<span className="flex shrink-0 items-center -space-x-1">
						{sparse && <LuPlus className="mr-1.5 size-3 shrink-0" />}
						{chosen.map((item) => (
							<Dot key={item.id} color={item.color} />
						))}
					</span>
				),
				text: count === 1 ? first.name : t({ message: `${count} labels` }),
				empty: false,
			};
		},
		pick: (fields, id) => {
			if (!sparse)
				return {
					...fields,
					labels: toggleLabel(fields.labels ?? [], id, options.labels),
				};
			const added = toggleLabel(fields.labels ?? [], id, []);
			const { labels: _labels, ...rest } = fields;
			return added.length > 0 ? { ...rest, labels: added } : rest;
		},
	};

	const cycle: FieldModel = {
		key: "cycle",
		name: names.cycle,
		placeholder: t({ message: "Add to cycle…" }),
		shortcut: "⇧C",
		shift: true,
		multi: false,
		rows: [
			{
				id: "",
				label: noneNames.cycle,
				icon: cycleIcon,
				hint: "0",
				checked: value.cycle === null,
			},
			...options.cycles.map(
				(item): PickerRow => ({
					id: item.id,
					label: cycleName(item),
					icon: cycleIcon,
					detail: [
						`${day(item.startsAt)} - ${day(item.endsAt)}`,
						cyclePhase(item),
					]
						.filter(Boolean)
						.join(" ・ "),
					checked: value.cycle === item.id,
				}),
			),
		],
		face: (fields) => {
			const found = options.cycles.find((item) => item.id === fields.cycle);
			if (found)
				return { icon: cycleIcon, text: cycleName(found), empty: false };
			return fields.cycle === null && sparse
				? { icon: cycleIcon, text: noneNames.cycle, empty: true }
				: { icon: cycleIcon, text: "", empty: true };
		},
		pick: (fields, id) => ({ ...fields, cycle: id || null }),
	};

	return [
		state,
		priority,
		assignee,
		project,
		...(options.estimates.length > 0 ? [estimate] : []),
		labels,
		...(options.cycles.length > 0 ? [cycle] : []),
	];
}
