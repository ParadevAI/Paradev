import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
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
	if (
		document.content.kind !== "text" ||
		!(document.dirty || document.pendingSave)
	) {
		return null;
	}
	return (
		<Button
			size="sm"
			variant="ghost"
			className="h-7 px-2 text-xs"
			disabled={document.pendingSave}
			onClick={() => void document.save()}
		>
			{document.pendingSave ? <Trans>Saving...</Trans> : <Trans>Save</Trans>}
		</Button>
	);
}
