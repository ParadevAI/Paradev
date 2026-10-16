import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { useState } from "react";
import { LuCircleUserRound, LuExternalLink, LuTag } from "react-icons/lu";
import { PullRequestStatusBadge } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/components/DashboardSidebarWorkspaceHoverCardContent/components/PullRequestStatusBadge";
import type {
	CardBlockViewProps,
	GithubLabelView,
	GithubPersonView,
} from "../../types";
import { ActionButton } from "../ActionButton";
import { type FieldFace, FieldPicker } from "../FieldPicker";
import { GithubAvatar } from "../GithubAvatar";
import { LinearMarkdown } from "../LinearMarkdown";
import { type Suggestion, SuggestionChips } from "../SuggestionChips";
import {
	orderedSelection,
	sameSelection,
	togglePick,
	triageSentence,
} from "./utils/triageSelection";

const ASSIGNEES_MAX = 10;
const ICON = "size-3.5 shrink-0";

const labelDot = (label: GithubLabelView) => (
	<span
		className="size-2.5 shrink-0 rounded-full bg-muted-foreground"
		style={label.color ? { backgroundColor: `#${label.color}` } : undefined}
	/>
);

const avatar = (person: GithubPersonView) => (
	<GithubAvatar name={person.login} avatarUrl={person.avatarUrl} />
);

/** A GitHub issue to triage: its text, then GitHub's sidebar pickers for labels and assignees with the agent's proposal already chosen, and the duplicate to close it against. */
export function GithubIssueBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"github.issue">) {
	const { t } = useLingui();
	const { issue, options, suggested, duplicate } = view;
	const ownLabels = issue.labels.map((label) => label.name);
	const ownAssignees = issue.assignees.map((person) => person.login);
	const [pickedLabels, setPickedLabels] = useState(() => [
		...ownLabels,
		...suggested.labels.filter((name) => !ownLabels.includes(name)),
	]);
	const [pickedAssignees, setPickedAssignees] = useState(() => [
		...ownAssignees,
		...suggested.assignees.filter((login) => !ownAssignees.includes(login)),
	]);
	const [open, setOpen] = useState<"labels" | "assignees" | null>(null);

	const action = (id: string) => actions.find((entry) => entry.id === id);
	const labels = orderedSelection(ownLabels, pickedLabels);
	const assignees = orderedSelection(ownAssignees, pickedAssignees);
	const unchanged =
		sameSelection(labels, ownLabels) && sameSelection(assignees, ownAssignees);
	const locked = done || pending || Boolean(action("apply")?.disabled);

	const allLabels = [
		...options.labels,
		...issue.labels.filter(
			(own) => !options.labels.some((each) => each.name === own.name),
		),
	];
	const allPeople = [
		...options.assignees,
		...issue.assignees.filter(
			(own) => !options.assignees.some((each) => each.login === own.login),
		),
	];
	const labelFace = (names: string[], none: string): FieldFace => {
		const chosen = names.flatMap(
			(name) => allLabels.find((each) => each.name === name) ?? [],
		);
		return chosen.length === 0
			? { icon: <LuTag className={ICON} />, text: none, empty: true }
			: {
					icon: (
						<span className="flex shrink-0 items-center -space-x-1">
							{chosen.map((label) => (
								<span key={label.name} className="flex">
									{labelDot(label)}
								</span>
							))}
						</span>
					),
					text: names.join(", "),
					empty: false,
				};
	};
	const peopleFace = (logins: string[], none: string): FieldFace => {
		const chosen = logins.flatMap(
			(login) => allPeople.find((each) => each.login === login) ?? [],
		);
		return chosen.length === 0
			? {
					icon: <LuCircleUserRound className={ICON} />,
					text: none,
					empty: true,
				}
			: {
					icon: (
						<span className="flex shrink-0 items-center -space-x-1">
							{chosen.map((person) => (
								<span key={person.login} className="flex">
									{avatar(person)}
								</span>
							))}
						</span>
					),
					text: logins.join(", "),
					empty: false,
				};
	};

	const suggestions: Suggestion[] = [
		...suggested.labels
			.filter((name) => !labels.includes(name))
			.flatMap((name): Suggestion[] => {
				const label = allLabels.find((each) => each.name === name);
				return label
					? [
							{
								id: `labels:${name}`,
								icon: labelDot(label),
								text: name,
								apply: () =>
									setPickedLabels((picked) => togglePick(picked, name)),
							},
						]
					: [];
			}),
		...suggested.assignees
			.filter((login) => !assignees.includes(login))
			.flatMap((login): Suggestion[] => {
				const person = allPeople.find((each) => each.login === login);
				return person
					? [
							{
								id: `assignees:${login}`,
								icon: avatar(person),
								text: login,
								apply: () =>
									setPickedAssignees((picked) =>
										togglePick(picked, login, ASSIGNEES_MAX),
									),
							},
						]
					: [];
			}),
	];

	const number = issue.number;
	const opened = formatDate(new Date(issue.createdAt));
	const duplicateNumber = duplicate?.number;

	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-1.5 px-4 py-3">
				<div className="flex min-w-0 items-center gap-2 text-[13px]">
					<PullRequestStatusBadge state={issue.state} />
					<span className="min-w-0 truncate font-medium text-foreground">
						{issue.title}
					</span>
					<a
						href={issue.url}
						target="_blank"
						rel="noreferrer"
						className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
					>
						{view.repo}#{number}
						<LuExternalLink className="size-3 opacity-60" />
					</a>
				</div>
				<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
					{issue.author && (
						<span className="inline-flex items-center gap-1.5">
							{avatar(issue.author)}
							{issue.author.login}
						</span>
					)}
					<span>{t({ message: `Opened on ${opened}` })}</span>
					<span>
						{t({
							message: plural(issue.comments, {
								one: "# comment",
								other: "# comments",
							}),
						})}
					</span>
				</div>
			</div>
			<div
				// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling body has to take keyboard focus
				tabIndex={0}
				data-issue-body
				className="max-h-64 overflow-y-auto border-t border-border px-4 py-3 outline-none"
			>
				{issue.body.trim() ? (
					<LinearMarkdown text={issue.body} />
				) : (
					<span className="text-[13px] text-muted-foreground">
						<Trans>No description provided.</Trans>
					</span>
				)}
			</div>
			{duplicate && (
				<div
					data-duplicate
					className="flex min-w-0 items-center gap-2 border-t border-border px-4 py-2.5 text-[13px]"
				>
					<span className="shrink-0 text-xs text-muted-foreground">
						<Trans>Duplicate of</Trans>
					</span>
					<a
						href={duplicate.url}
						target="_blank"
						rel="noreferrer"
						className="inline-flex min-w-0 items-center gap-1.5 text-foreground hover:underline"
					>
						<span className="shrink-0 text-muted-foreground">
							#{duplicateNumber}
						</span>
						<span className="truncate">{duplicate.title}</span>
					</a>
					<PullRequestStatusBadge state={duplicate.state} />
				</div>
			)}
			<div className="flex flex-col gap-2.5 border-t border-border px-4 py-3">
				<SuggestionChips suggestions={suggestions} disabled={locked} />
				<div className="flex flex-wrap items-center gap-1.5">
					<FieldPicker
						model={{
							key: "labels",
							name: t({ message: "Labels" }),
							placeholder: t({ message: "Filter labels" }),
							multi: true,
							rows: allLabels.map((label) => ({
								id: label.name,
								label: label.name,
								icon: labelDot(label),
								detail: label.description ?? undefined,
								checked: labels.includes(label.name),
							})),
						}}
						face={labelFace(labels, t({ message: "Labels" }))}
						was={
							sameSelection(labels, ownLabels)
								? undefined
								: labelFace(ownLabels, t({ message: "No labels" }))
						}
						open={open === "labels"}
						onOpenChange={(next) => setOpen(next ? "labels" : null)}
						onPick={(name) =>
							setPickedLabels((picked) => togglePick(picked, name))
						}
						disabled={locked}
					/>
					<FieldPicker
						model={{
							key: "assignees",
							name: t({ message: "Assignees" }),
							placeholder: t({ message: "Type or choose a user" }),
							multi: true,
							rows: allPeople.map((person) => ({
								id: person.login,
								label: person.login,
								icon: avatar(person),
								checked: assignees.includes(person.login),
							})),
						}}
						face={peopleFace(assignees, t({ message: "Assignees" }))}
						was={
							sameSelection(assignees, ownAssignees)
								? undefined
								: peopleFace(ownAssignees, t({ message: "No one assigned" }))
						}
						open={open === "assignees"}
						onOpenChange={(next) => setOpen(next ? "assignees" : null)}
						onPick={(login) =>
							setPickedAssignees((picked) =>
								togglePick(picked, login, ASSIGNEES_MAX),
							)
						}
						disabled={locked}
					/>
				</div>
			</div>
			{failure && (
				<p
					role="alert"
					className="border-t border-border px-4 py-3 text-xs text-destructive"
				>
					{failure}
				</p>
			)}
			{!done && (
				<div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
					<ActionButton
						action={action("dismiss")}
						pending={pending}
						variant="ghost"
						onClick={() => onAct("dismiss")}
					>
						{action("dismiss")?.label}
					</ActionButton>
					{duplicate && (
						<ActionButton
							action={action("close_duplicate")}
							pending={pending}
							variant="outline"
							onClick={() =>
								onAct("close_duplicate", { duplicate: duplicate.number })
							}
						>
							{action("close_duplicate")?.label}
						</ActionButton>
					)}
					<ActionButton
						action={action("apply")}
						pending={pending}
						disabled={unchanged}
						confirmText={triageSentence(
							view.plan,
							{ labels: ownLabels, assignees: ownAssignees },
							{ labels, assignees },
						)}
						onClick={() => onAct("apply", { labels, assignees })}
					>
						{action("apply")?.label}
					</ActionButton>
				</div>
			)}
		</div>
	);
}
