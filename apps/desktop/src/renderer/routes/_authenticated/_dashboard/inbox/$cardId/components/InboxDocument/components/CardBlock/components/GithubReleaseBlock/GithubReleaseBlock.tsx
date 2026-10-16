import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Checkbox } from "@superset/ui/checkbox";
import { useId, useState } from "react";
import { LuExternalLink, LuTag } from "react-icons/lu";
import type { CardBlockViewProps } from "../../types";
import { fillClause } from "../../utils/handoffPlan";
import { ActionButton } from "../ActionButton";
import { GithubCommitList } from "../GithubCommitList";
import { LinearDescriptionField } from "../LinearDescriptionField";
import { LinearTitleInput } from "../LinearTitleInput";

const NO_HANDLES: string[] = [];

/** GitHub's "Draft a new release" form: the tag and where it points, the title, the notes, and publish or save as a draft. */
export function GithubReleaseBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"github.release">) {
	const { t } = useLingui();
	const prereleaseId = useId();
	const latestId = useId();
	const [name, setName] = useState(view.name);
	const [notes, setNotes] = useState(view.notes);
	const [prerelease, setPrerelease] = useState(view.prerelease);
	const [latest, setLatest] = useState(view.latest);
	const [served, setServed] = useState(view.notes);
	if (served !== view.notes) {
		if (notes === served) setNotes(view.notes);
		setServed(view.notes);
	}

	const action = (id: string) => actions.find((entry) => entry.id === id);
	const title = name.trim();
	const input = {
		sha: view.sha,
		name: title,
		notes,
		prerelease,
		latest: latest && !prerelease,
	};
	const { target, previous, existing } = view;
	const short = view.sha.slice(0, 7);
	const previousTag = previous?.tag;
	const since = t({
		message: plural(view.total, {
			one: `# commit since ${previousTag}`,
			other: `# commits since ${previousTag}`,
		}),
	});
	const locked = done || pending;
	const cut = (id: "publish" | "draft") => ({
		action: action(id),
		pending,
		disabled: title === "",
		confirmText: `${fillClause(view.plan[id], { name: title })}${
			prerelease
				? view.plan.prerelease
				: id === "publish" && latest
					? view.plan.latest
					: ""
		}`,
		onClick: () => onAct(id, input),
		children: action(id)?.label,
	});

	return (
		<div className="flex flex-col">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-xs text-muted-foreground">
				<span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border px-2 font-mono text-[11.5px] text-foreground">
					<LuTag className="size-3 shrink-0" />
					{view.tag}
				</span>
				<span data-tag-state={view.tagExists ? "existing" : "new"}>
					{view.tagExists ? (
						<Trans>
							Existing tag at <span className="font-mono">{short}</span>
						</Trans>
					) : (
						<Trans>
							New tag on <span className="font-mono">{target}</span> at{" "}
							<span className="font-mono">{short}</span>
						</Trans>
					)}
				</span>
				{previous &&
					(view.compareUrl ? (
						<a
							href={view.compareUrl}
							target="_blank"
							rel="noreferrer"
							className="text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
						>
							{since}
						</a>
					) : (
						<span>{since}</span>
					))}
				{existing && (
					<a
						href={existing.url}
						target="_blank"
						rel="noreferrer"
						data-existing
						className="inline-flex items-center gap-1 text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
					>
						<Trans>View on GitHub</Trans>
						<LuExternalLink className="size-3 opacity-60" />
					</a>
				)}
				<span className="ml-auto shrink-0">{view.repo}</span>
			</div>
			<div className="flex flex-col gap-3 border-t border-border px-4 py-3">
				<LinearTitleInput value={name} onChange={setName} disabled={locked} />
				<LinearDescriptionField
					label={t({ message: "Release notes" })}
					value={notes}
					onChange={setNotes}
					handles={NO_HANDLES}
					disabled={locked}
				/>
				<div className="flex items-center gap-2 text-[13px] text-foreground">
					<Checkbox
						id={prereleaseId}
						checked={prerelease}
						disabled={locked}
						onCheckedChange={(next) => setPrerelease(next === true)}
					/>
					<label htmlFor={prereleaseId}>
						<Trans>Set as a pre-release</Trans>
					</label>
				</div>
				<div className="flex items-center gap-2 text-[13px] text-foreground">
					<Checkbox
						id={latestId}
						checked={latest && !prerelease}
						disabled={locked || prerelease}
						onCheckedChange={(next) => setLatest(next === true)}
					/>
					<label htmlFor={latestId}>
						<Trans>Set as the latest release</Trans>
					</label>
				</div>
				<GithubCommitList commits={view.commits} total={view.total} />
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
					<ActionButton
						action={action("generate")}
						pending={pending}
						variant="outline"
						confirmText={view.plan.generate ?? undefined}
						onClick={() => onAct("generate")}
					>
						{action("generate")?.label}
					</ActionButton>
					<ActionButton {...cut("draft")} variant="outline" />
					<ActionButton {...cut("publish")} />
				</div>
			)}
		</div>
	);
}
