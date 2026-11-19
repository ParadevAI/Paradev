import { useLingui } from "@lingui/react/macro";
import { prompt } from "@superset/alert-prompt";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef } from "react";
import { Alert } from "react-native";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

interface ActionablePage {
	id: string;
	title: string;
	createdByUserId: string | null;
}

export interface PageActions {
	duplicate: () => void;
	/** Null unless the viewer created the page. */
	rename: (() => void) | null;
	remove: (() => void) | null;
}

export function usePageActions(
	page: ActionablePage | null | undefined,
	{ onDeleted }: { onDeleted?: () => void } = {},
): PageActions | null {
	const { t } = useLingui();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const duplicating = useRef(false);
	if (!page) return null;

	const { id, title } = page;
	const isOwner =
		session?.user.id !== undefined && session.user.id === page.createdByUserId;
	const refreshList = () =>
		queryClient.invalidateQueries({ queryKey: ["cloud", "page", "list"] });

	const duplicate = async () => {
		if (duplicating.current) return;
		duplicating.current = true;
		try {
			const copy = await apiClient.page.duplicate.mutate({
				id,
				title: t({ message: `${title} (copy)` }).slice(0, 200),
			});
			void refreshList();
			router.push({
				pathname: "/(authenticated)/pages/[slug]",
				params: { slug: copy.slug },
			});
		} catch {
			Alert.alert(t({ message: "Could not duplicate this page" }));
		} finally {
			duplicating.current = false;
		}
	};

	const rename = async () => {
		const next = await prompt({
			title: t({ message: "Rename page" }),
			defaultValue: title,
			confirmText: t({ message: "Rename" }),
			selectText: true,
		});
		const trimmed = next?.trim().slice(0, 200);
		if (!trimmed || trimmed === title) return;
		try {
			await apiClient.page.update.mutate({ id, title: trimmed });
			void queryClient.invalidateQueries({
				queryKey: ["cloud", "page", "pull"],
			});
			void refreshList();
		} catch {
			Alert.alert(t({ message: "Could not rename this page" }));
		}
	};

	const remove = () =>
		Alert.alert(
			t({ message: `Delete "${title}"?` }),
			t({ message: "The page and every version of it will be deleted." }),
			[
				{ text: t({ message: "Cancel" }), style: "cancel" },
				{
					text: t({ message: "Delete" }),
					style: "destructive",
					onPress: async () => {
						try {
							await apiClient.page.delete.mutate({ id });
							void refreshList();
							onDeleted?.();
						} catch {
							Alert.alert(t({ message: "Could not delete this page" }));
						}
					},
				},
			],
		);

	return {
		duplicate: () => void duplicate(),
		rename: isOwner ? () => void rename() : null,
		remove: isOwner ? remove : null,
	};
}
