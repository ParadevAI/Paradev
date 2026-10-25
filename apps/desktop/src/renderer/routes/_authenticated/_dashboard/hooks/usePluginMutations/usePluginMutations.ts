import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { getPluginByName } from "@superset/shared/plugins";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";

const displayName = (name: string) =>
	getPluginByName(name)?.interface.displayName ?? name;

/** Install/uninstall with shared toasts, analytics, and invalidation. */
export function usePluginMutations() {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const navigate = useNavigate();

	const accountInstall = cloudTrpc.plugins.install.useMutation();
	const accountUninstall = cloudTrpc.plugins.uninstall.useMutation();
	const accountSetEnabled = cloudTrpc.plugins.setEnabled.useMutation();

	const invalidate = async () => {
		await Promise.all([
			utils.plugins.list.invalidate(),
			utils.plugins.connections.list.invalidate(),
		]);
	};

	const machineSetEnabled = electronTrpc.plugins.setEnabled.useMutation();

	const wasDisabled = (name: string) =>
		utils.plugins.list
			.getData()
			?.some((row) => row.name === name && row.installed && !row.enabled) ??
		false;

	const syncAccountInstall = async (name: string): Promise<boolean> => {
		const reenable = wasDisabled(name);
		try {
			await accountInstall.mutateAsync({ name });
			if (reenable) {
				await machineSetEnabled.mutateAsync({ name, enabled: true });
				await accountSetEnabled.mutateAsync({ name, enabled: true });
			}
			return true;
		} catch (error) {
			toast.warning(
				t({
					message: `${displayName(name)} is set up on this machine, but not on your account`,
				}),
				{ description: errorMessage(error) },
			);
			return false;
		} finally {
			await invalidate();
		}
	};

	const installMutation = electronTrpc.plugins.install.useMutation({
		onSuccess: (_data, variables) => {
			posthog.capture("plugin_installed", { plugin: variables.name });
			toast.success(
				t({
					message: `${displayName(variables.name)} installed`,
				}),
				{
					description: t({
						message: "Takes effect in new agent sessions.",
					}),
				},
			);
		},
		onError: (error) => {
			toast.error(
				t({
					message: "Install failed",
				}),
				{ description: errorMessage(error) },
			);
		},
	});
	const uninstallMutation = electronTrpc.plugins.uninstall.useMutation({
		onSuccess: async (_data, variables) => {
			let disconnected = 0;
			try {
				const result = await accountUninstall.mutateAsync({
					name: variables.name,
				});
				disconnected = result.disconnected;
			} catch (error) {
				toast.warning(
					t({
						message: `${displayName(variables.name)} is set up on this machine, but not on your account`,
					}),
					{ description: errorMessage(error) },
				);
			} finally {
				await invalidate();
			}
			posthog.capture("plugin_uninstalled", { plugin: variables.name });
			toast.warning(
				t({
					message: `${displayName(variables.name)} uninstalled`,
				}),
				{
					description:
						disconnected > 0
							? t({ message: "Its connected accounts were disconnected." })
							: t({ message: "Takes effect in new agent sessions." }),
				},
			);
		},
		onError: (error) => {
			toast.error(
				t({
					message: "Uninstall failed",
				}),
				{ description: errorMessage(error) },
			);
		},
	});

	const updateMutation = electronTrpc.plugins.install.useMutation({
		onSuccess: (_data, variables) => {
			posthog.capture("plugin_updated", { plugin: variables.name });
			toast.success(
				t({
					message: `${displayName(variables.name)} updated`,
				}),
				{
					description: t({
						message: "Takes effect in new agent sessions.",
					}),
				},
			);
		},
		onError: (error) => {
			toast.error(
				t({
					message: "Could not update plugin",
				}),
				{ description: errorMessage(error) },
			);
		},
	});

	const add = async (name: string): Promise<boolean> => {
		navigate({ to: "/plugins/$pluginName", params: { pluginName: name } });
		await installMutation.mutateAsync({ name });
		return await syncAccountInstall(name);
	};

	const update = async (name: string): Promise<boolean> => {
		await updateMutation.mutateAsync({ name });
		return await syncAccountInstall(name);
	};

	return {
		add,
		update,
		install: async (name: string) => {
			await installMutation.mutateAsync({ name });
			return await syncAccountInstall(name);
		},
		uninstall: (name: string) => uninstallMutation.mutate({ name }),
		isBusy:
			installMutation.isPending ||
			updateMutation.isPending ||
			uninstallMutation.isPending ||
			machineSetEnabled.isPending ||
			accountInstall.isPending ||
			accountUninstall.isPending ||
			accountSetEnabled.isPending,
	};
}
