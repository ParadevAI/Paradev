import { createHash, randomUUID } from "node:crypto";

export function scopedCommandId(scope: string, commandId?: string): string {
	if (!commandId) return randomUUID();
	const hash = createHash("sha256")
		.update(JSON.stringify([scope, commandId]))
		.digest("hex");
	return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
