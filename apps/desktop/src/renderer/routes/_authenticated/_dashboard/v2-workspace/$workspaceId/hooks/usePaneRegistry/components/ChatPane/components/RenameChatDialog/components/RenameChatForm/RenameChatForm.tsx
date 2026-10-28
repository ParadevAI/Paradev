import { Trans, useLingui } from "@lingui/react/macro";
import { CHAT_TITLE_MAX } from "@superset/chat/protocol";
import { Button } from "@superset/ui/button";
import {
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";

export function RenameChatForm({
	initialTitle,
	onCancel,
	onRename,
}: {
	initialTitle: string;
	onCancel: () => void;
	onRename: (title: string | null) => Promise<void>;
}) {
	const { t } = useLingui();
	const [draft, setDraft] = useState(initialTitle);
	const [pending, setPending] = useState<"save" | "regenerate" | null>(null);
	const run = async (title: string | null) => {
		setPending(title === null ? "regenerate" : "save");
		try {
			await onRename(title);
		} finally {
			setPending(null);
		}
	};

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				if (draft.trim() && !pending) void run(draft.trim());
			}}
		>
			<DialogHeader>
				<DialogTitle>
					<Trans>Rename chat</Trans>
				</DialogTitle>
				<DialogDescription>
					<Trans>Keep it short and recognizable.</Trans>
				</DialogDescription>
			</DialogHeader>

			<Input
				autoFocus
				value={draft}
				maxLength={CHAT_TITLE_MAX}
				placeholder={t({ message: "Chat title" })}
				aria-label={t({ message: "Chat title" })}
				onChange={(event) => setDraft(event.target.value)}
				className="my-4"
			/>

			<DialogFooter className="sm:justify-between">
				<Button
					type="button"
					variant="outline"
					onClick={() => void run(null)}
					disabled={pending !== null}
				>
					{pending === "regenerate" ? (
						<LoaderCircle className="size-4 animate-spin" />
					) : (
						<RefreshCw className="size-4" />
					)}
					<Trans>Regenerate</Trans>
				</Button>
				<div className="flex gap-2">
					<Button
						type="button"
						variant="ghost"
						onClick={onCancel}
						disabled={pending !== null}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button type="submit" disabled={pending !== null || !draft.trim()}>
						<Trans>Save</Trans>
					</Button>
				</div>
			</DialogFooter>
		</form>
	);
}
