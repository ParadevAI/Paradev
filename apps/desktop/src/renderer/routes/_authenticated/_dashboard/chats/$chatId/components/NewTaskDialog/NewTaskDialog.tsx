import { Trans, useLingui } from "@lingui/react/macro";
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
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { TaskAssigneeMenu } from "../../../components/TaskAssigneeMenu";
import { TaskWhenMenu } from "../../../components/TaskWhenMenu";
import { NO_SCHEDULE } from "../../../utils/taskSchedule";

interface NewTaskDialogProps {
	state: ChatState;
	chat: Chat;
	now: Date;
	/** What the form starts with: a message's words, when it is turned into a task. */
	initial: { title: string; description: string };
	onOpenChange: (open: boolean) => void;
	/** The new task's id, or null when it was not made. */
	onCreate: (form: TaskForm) => Promise<string | null>;
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
	onCreated,
}: NewTaskDialogProps) {
	const { t } = useLingui();
	const [title, setTitle] = useState(initial.title);
	const [description, setDescription] = useState(initial.description);
	const [assignee, setAssignee] = useState<string | null>(() =>
		defaultTaskAssignee(state, chat),
	);
	const [schedule, setSchedule] = useState<TaskSchedule>(NO_SCHEDULE);
	const [isCreating, setIsCreating] = useState(false);

	const options = taskAssigneeOptions(state, chat);
	const [ref] = assignee ? parseMentionTokens(assignee) : [];
	const chosen =
		options.find(
			(option) => option.kind === ref?.kind && option.id === ref.id,
		) ?? null;
	const name = title.trim();

	const create = async () => {
		if (!name || isCreating) return;
		setIsCreating(true);
		const taskId = await onCreate({
			title: name,
			description: description.trim(),
			assignee: chosen ? assignee : null,
			...schedule,
		});
		setIsCreating(false);
		if (!taskId) return;
		onOpenChange(false);
		onCreated(taskId);
	};

	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>New task</Trans>
					</DialogTitle>
				</DialogHeader>
				<form
					className="flex flex-col gap-3"
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
					<Textarea
						value={description}
						rows={3}
						placeholder={t({ message: "Details (optional)" })}
						onChange={(event) => setDescription(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
								void create();
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
