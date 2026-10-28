import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useSharedFileDocument } from "../../../../../../../../state/fileDocumentStore";

interface FileSaveButtonProps {
	workspaceId: string;
	filePath: string;
}

export function FileSaveButton({ workspaceId, filePath }: FileSaveButtonProps) {
	const document = useSharedFileDocument({
		workspaceId,
		absolutePath: filePath,
	});
	if (document.content.kind !== "text") return null;
	// Keeps its slot while hidden so the breadcrumb does not refit on every edit.
	const shown = document.dirty || document.pendingSave;
	return (
		<Button
			size="sm"
			className={cn("h-7 px-3 text-xs", !shown && "invisible")}
			aria-hidden={!shown}
			tabIndex={shown ? undefined : -1}
			disabled={!shown || document.pendingSave}
			onClick={() => void document.save()}
		>
			<Trans>Save</Trans>
		</Button>
	);
}
