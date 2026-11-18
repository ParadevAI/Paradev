import { Trans } from "@lingui/react/macro";
import { mentionToken, type TaskAssignee } from "@superset/chats-core";
import { Avatar } from "@superset/ui/atoms/Avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuUser } from "react-icons/lu";
import { DevFace } from "renderer/routes/_authenticated/_dashboard/chats/components/DevFace";
import { TASK_CHIP } from "../TaskStatusMenu";

function Face({ assignee }: { assignee: TaskAssignee }) {
	return assignee.kind === "dev" ? (
		<DevFace devId={assignee.id} size={16} />
	) : (
		<Avatar size="xs" fullName={assignee.name} image={null} />
	);
}

interface TaskAssigneeMenuProps {
	assignee: TaskAssignee | null;
	options: TaskAssignee[];
	/** A mention token for who takes it, or null for nobody. */
	onChange: (assignee: string | null) => void;
}

/** Who has the task, as a chip that hands it to someone else in the chat. */
export function TaskAssigneeMenu({
	assignee,
	options,
	onChange,
}: TaskAssigneeMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button type="button" className={TASK_CHIP}>
					{assignee ? (
						<>
							<Face assignee={assignee} />
							<span className="truncate">{assignee.name}</span>
						</>
					) : (
						<>
							<LuUser className="size-3.5 text-muted-foreground" />
							<span className="text-muted-foreground">
								<Trans>Assign</Trans>
							</span>
						</>
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				{options.map((option) => (
					<DropdownMenuItem
						key={option.id}
						onSelect={() => onChange(mentionToken(option))}
					>
						<Face assignee={option} />
						{option.name}
					</DropdownMenuItem>
				))}
				{assignee && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={() => onChange(null)}>
							<Trans>Nobody</Trans>
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
