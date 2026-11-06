import { useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset } from "@superset/chat/core";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import { toast } from "@superset/ui/sonner";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NewChatDefaults } from "renderer/routes/_authenticated/components/AgentComposer/components/ModelPicker";
import { useChatWiring } from "../../../../hooks/useSessionClient";

type Defaults = NewChatDefaults["value"];

/** Undefined when the agent has no chat harness or its host predates chat defaults. */
export function useNewChatDefaults(
	presetId: string | undefined,
): NewChatDefaults | undefined {
	const { t } = useLingui();
	const { hostUrl } = useWorkspaceClient();
	const { transport } = useChatWiring();
	const queryClient = useQueryClient();
	const harness = acpHarnessForPreset(presetId);
	const queryKey = ["chat-new-chat-defaults", hostUrl, harness];

	const query = useQuery({
		queryKey,
		enabled: Boolean(harness),
		queryFn: async (): Promise<Defaults | null> => {
			if (!harness) return null;
			try {
				return await transport.getDefaultSelections({ harness });
			} catch (error) {
				if (isMissingProcedureError(error)) return null;
				throw error;
			}
		},
		staleTime: 30_000,
	});

	const mutation = useMutation({
		mutationFn: (defaults: Defaults) => {
			if (!harness) throw new Error("no chat harness");
			return transport.setDefaultSelections({ harness, ...defaults });
		},
		onSuccess: (saved) => queryClient.setQueryData(queryKey, saved),
		onError: () =>
			toast.error(t({ message: "Couldn't save the default for new chats" })),
	});

	if (!harness || !query.data) return undefined;
	return {
		value: mutation.isPending ? mutation.variables : query.data,
		onChange: (defaults) => mutation.mutate(defaults),
	};
}
