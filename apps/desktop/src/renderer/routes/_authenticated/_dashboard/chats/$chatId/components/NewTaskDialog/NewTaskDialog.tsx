import { Trans, useLingui } from "@lingui/react/macro";
import {
	draftChips,
	draftText,
	type PromptInputHandle,
} from "@superset/chat-ui/PromptInput";
import {
	type Chat,
	type ChatState,
	parseMentionTokens,
	taskAssigneeOptions,
} from "@superset/chats-core";
import {
	defaultTaskAssignee,
	type TaskForm,
	type TaskSchedule,
} from "@superset/chats-sync";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgentComposer } from "renderer/routes/_authenticated/components/AgentComposer";
import { TaskAssigneeMenu } from "../../../components/TaskAssigneeMenu";
import { TaskWhenMenu } from "../../../components/TaskWhenMenu";
import { useChatGitHubProviders } from "../../../hooks/useChatGitHubProviders";
import { NO_SCHEDULE } from "../../../utils/taskSchedule";
import { ExistingTaskPicker } from "./components/ExistingTaskPicker";

interface NewTaskDialogProps {
	state: ChatState;
	chat: Chat;
	now: Date;
	/** What the form starts with: a message's words, when it is turned into a task. */
	initial: { title: string; description: string };
	onOpenChange: (open: boolean) => void;
	/** The new task's id, or null when it was not made. */
	onCreate: (form: TaskForm) => Promise<string | null>;
	/** Adds a task made outside the chats; its id, or null when it was not added. */
	onImport: (taskId: string) => Promise<string | null>;
	onCreated: (taskId: string) => void;
}

/** A new task for the chat: what, who and when. */
export function NewTaskDialog({
	state,
	chat,
	now,
	initial,
	onOpenChange,
	onCreate,
	onImport,
	onCreated,
}: NewTaskDialogProps) {
	const { t } = useLingui();
	const [title, setTitle] = useState(initial.title);
	const [description, setDescription] = useState(initial.description);
	const titleRef = useRef(title);
	titleRef.current = title;
	const githubProviders = useChatGitHubProviders();
	const details = useRef<PromptInputHandle>(null);
	const initialDescription = useRef(initial.description);
	useEffect(() => {
		if (initialDescription.current)
			details.current?.restoreDraft({
				attachments: [],
				segments: [{ type: "text", text: initialDescription.current }],
			});
	}, []);
	const [assignee, setAssignee] = useState<string | null>(() =>
		defaultTaskAssignee(state, chat),
	);
	const [schedule, setSchedule] = useState<TaskSchedule>(NO_SCHEDULE);
	const [isCreating, setIsCreating] = useState(false);
	const [mode, setMode] = useState<"new" | "existing">("new");
	const takenIds = useMemo(
		() => new Set(state.tasks.map((task) => task.id)),
		[state.tasks],
	);
	const modes = [
		{ id: "new" as const, label: t({ message: "New" }) },
		{ id: "existing" as const, label: t({ message: "Existing task" }) },
	];
	const finish = async (work: Promise<string | null>) => {
		setIsCreating(true);
		const taskId = await work;
		setIsCreating(false);
		if (!taskId) return;
		onOpenChange(false);
		onCreated(taskId);
	};

	const options = taskAssigneeOptions(state, chat);
	const [ref] = assignee ? parseMentionTokens(assignee) : [];
	const chosen =
		options.find(
			(option) => option.kind === ref?.kind && option.id === ref.id,
		) ?? null;
	const name = title.trim();

	const create = async () => {
		if (!name || isCreating) return;
		await finish(
			onCreate({
				title: name,
				description: description.trim(),
				assignee: chosen ? assignee : null,
				...schedule,
			}),
		);
	};

	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>New task</Trans>
					</DialogTitle>
				</DialogHeader>
				<div className="flex gap-1">
					{modes.map((entry) => (
						<button
							key={entry.id}
							type="button"
							aria-pressed={entry.id === mode}
							onClick={() => setMode(entry.id)}
							className={cn(
								"h-7 rounded-md px-2.5 text-muted-foreground text-sm hover:bg-fill-hover hover:text-foreground",
								entry.id === mode && "bg-fill-selected text-foreground",
							)}
						>
							{entry.label}
						</button>
					))}
				</div>
				{mode === "existing" && (
					<ExistingTaskPicker
						takenIds={takenIds}
						isAdding={isCreating}
						onPick={(taskId) => void finish(onImport(taskId))}
					/>
				)}
				<form
					className={cn(
						"flex min-w-0 flex-col gap-3",
						mode !== "new" && "hidden",
					)}
					onSubmit={(event) => {
						event.preventDefault();
						void create();
					}}
				>
					<Input
						autoFocus
						value={title}
						maxLength={200}
						placeholder={t({ message: "What needs doing" })}
						onChange={(event) => setTitle(event.target.value)}
					/>
					<AgentComposer
						ref={details}
						layout="inline"
						placeholder={t({
							message: "Details, or @ an issue or pull request",
						})}
						mentionProviders={githubProviders}
						onDraftChange={(draft) => {
							setDescription(draftText(draft.segments));
							const [linked] = draftChips(draft.segments);
							if (linked?.description && !titleRef.current.trim())
								setTitle(`${linked.label} ${linked.description}`);
						}}
						onSubmit={() => {
							void create();
							return false;
						}}
					/>
					<div className="flex flex-wrap items-center gap-1.5">
						<TaskAssigneeMenu
							assignee={chosen}
							options={options}
							onChange={setAssignee}
						/>
						<TaskWhenMenu
							value={{
								...schedule,
								assigneeDevId: chosen?.kind === "dev" ? chosen.id : null,
								status: "todo",
							}}
							devName={chosen?.kind === "dev" ? chosen.name : null}
							now={now}
							onChange={setSchedule}
						/>
					</div>
					<Button type="submit" disabled={!name || isCreating}>
						<Trans>Add task</Trans>
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
