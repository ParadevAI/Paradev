import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useScopeSelection } from "../useScopeSelection";

export function useScopeLabel(): string {
	const { t } = useLingui();
	const { label, orgHosts } = useScopeSelection();
	switch (label.kind) {
		case "host":
			return (
				orgHosts.find((host) => host.machineId === label.machineId)?.name ?? ""
			);
		case "cloud":
			return t({ message: "Cloud" });
		case "all":
			return t({ message: "All hosts" });
		default:
			return t({
				message: plural(label.count, { one: "# host", other: "# hosts" }),
			});
	}
}
