import { Button } from "@superset/ui/button";
import { Plus } from "lucide-react";

interface CreateWorktreeButtonProps {
	onClick: () => void;
	isCreating: boolean;
}

export function CreateWorktreeButton({
	onClick,
	isCreating,
}: CreateWorktreeButtonProps) {
	return (
		<Button
			variant="ghost"
			size="sm"
			onClick={onClick}
			disabled={isCreating}
			className="w-full h-8 px-3 font-normal border border-dashed border-neutral-700 mt-3"
			style={{ justifyContent: "flex-start" }}
		>
			<Plus size={16} />
			<span>{isCreating ? "Creating..." : "New Worktree"}</span>
		</Button>
	);
}
