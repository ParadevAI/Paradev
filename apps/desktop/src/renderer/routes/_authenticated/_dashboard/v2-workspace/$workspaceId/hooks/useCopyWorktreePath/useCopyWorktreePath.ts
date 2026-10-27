import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function useCopyWorktreePath() {
	const { t } = useLingui();
	return electronTrpc.external.copyPath.useMutation({
		onSuccess: () =>
			toast.success(
				t({
					message: "Path copied to clipboard",
				}),
			),
		onError: (error) =>
			toast.error(
				t({
					message: `Failed to copy path: ${error.message}`,
				}),
			),
	});
}
