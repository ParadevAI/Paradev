/**
 * The host id is derived from /etc/machine-id. An empty or placeholder value
 * (common in container and VM images) gives every such machine the same host
 * id, so they collide in the organization.
 */
export function machineIdProblem(raw: string): string | null {
	const value = raw.trim();
	if (value === "" || value === "uninitialized") {
		return "/etc/machine-id is empty, so this machine would share its host id with every other machine built from the same image";
	}
	if (!/^[0-9a-f]{32}$/.test(value)) {
		return `/etc/machine-id is not a valid machine id (${value.slice(0, 40)})`;
	}
	return null;
}

export const MACHINE_ID_FIX =
	"Give it a unique id, then re-run: sudo rm -f /etc/machine-id && sudo systemd-machine-id-setup";
