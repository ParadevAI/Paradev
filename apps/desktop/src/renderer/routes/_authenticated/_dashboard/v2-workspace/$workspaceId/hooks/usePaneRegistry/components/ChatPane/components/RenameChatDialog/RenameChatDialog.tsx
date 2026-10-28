import { Dialog, DialogContent } from "@superset/ui/dialog";
import { RenameChatForm } from "./components/RenameChatForm";

export function RenameChatDialog({
	open,
	title,
	onOpenChange,
	onRename,
}: {
	open: boolean;
	title: string;
	onOpenChange: (open: boolean) => void;
	onRename: (title: string | null) => Promise<boolean>;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				{open ? (
					<RenameChatForm
						initialTitle={title}
						onCancel={() => onOpenChange(false)}
						onRename={async (next) => {
							if (await onRename(next)) onOpenChange(false);
						}}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
