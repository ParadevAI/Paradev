import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function useUpdateDev() {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	return cloudTrpc.agent.update.useMutation({
		onSuccess: () => void utils.agent.invalidate(),
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			),
	});
}
