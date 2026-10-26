const MAX_ADMISSION_BYTES = 16 * 1024;
const admissions = new WeakMap<
	object,
	{ terminalId: string; workspaceId: string; read(): Uint8Array | null }
>();

export function registerFreshAdmission(
	session: object,
	value: { terminalId: string; workspaceId: string; read(): Uint8Array | null },
): void {
	admissions.set(session, value);
}

export function invalidateFreshAdmission(session: object): void {
	admissions.delete(session);
}

export function readFreshAdmission(
	session: object,
	terminalId: string,
	workspaceId: string,
): Uint8Array | null {
	const entry = admissions.get(session);
	if (
		!entry ||
		entry.terminalId !== terminalId ||
		entry.workspaceId !== workspaceId
	)
		return null;
	const data = entry.read();
	return data && data.byteLength > 0 && data.byteLength <= MAX_ADMISSION_BYTES
		? data.slice()
		: null;
}
