import { gunzipSync } from "node:zlib";

/**
 * The files Gmail will not let a person download, from its published list
 * (support.google.com/mail/answer/6590): these extensions, the same files
 * gzip- or bzip2-compressed, and archives that carry them or carry
 * password-protected archives. Gmail updates the list on its own schedule.
 */
const BLOCKED_EXTENSIONS = new Set(
	"ade adp apk appx appxbundle bat cab chm cmd com cpl diagcab diagcfg diagpkg dll dmg ex ex_ exe hta img ins iso isp jar jnlp js jse lib lnk mde mjs msc msi msix msixbundle msp mst nsh pif ps1 scr sct shb sys vb vbe vbs vhd vxd wsc wsf wsh xll".split(
		" ",
	),
);

const COMPRESSED = /\.(gz|bz2)$/i;
const ARCHIVE = /\.(zip|tgz|tar\.gz|tar)$/i;

export function blockedByName(filename: string): boolean {
	const name = filename.trim().toLowerCase().replace(COMPRESSED, "");
	const extension = name.includes(".")
		? name.slice(name.lastIndexOf(".") + 1)
		: "";
	return BLOCKED_EXTENSIONS.has(extension);
}

export function isArchive(filename: string): boolean {
	return ARCHIVE.test(filename.trim());
}

interface Entry {
	name: string;
	encrypted: boolean;
}

function zipEntries(bytes: Uint8Array): Entry[] | null {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let end = -1;
	for (
		let i = bytes.length - 22;
		i >= Math.max(0, bytes.length - 65_557);
		i--
	) {
		if (view.getUint32(i, true) === 0x06054b50) {
			end = i;
			break;
		}
	}
	if (end < 0) return null;
	const count = view.getUint16(end + 10, true);
	let at = view.getUint32(end + 16, true);
	const entries: Entry[] = [];
	for (let n = 0; n < count; n++) {
		if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50)
			return null;
		const flags = view.getUint16(at + 8, true);
		const nameLength = view.getUint16(at + 28, true);
		const extra = view.getUint16(at + 30, true);
		const comment = view.getUint16(at + 32, true);
		const name = new TextDecoder().decode(
			bytes.subarray(at + 46, at + 46 + nameLength),
		);
		entries.push({ name, encrypted: (flags & 1) === 1 });
		at += 46 + nameLength + extra + comment;
	}
	return entries;
}

function tarEntries(bytes: Uint8Array): Entry[] | null {
	const entries: Entry[] = [];
	for (let at = 0; at + 512 <= bytes.length; ) {
		const header = bytes.subarray(at, at + 512);
		if (header.every((b) => b === 0)) return entries;
		if (new TextDecoder().decode(header.subarray(257, 262)) !== "ustar")
			return null;
		const text = (from: number, to: number) =>
			new TextDecoder().decode(header.subarray(from, to)).replace(/\0.*$/s, "");
		const prefix = text(345, 500);
		entries.push({
			name: prefix ? `${prefix}/${text(0, 100)}` : text(0, 100),
			encrypted: false,
		});
		const size = Number.parseInt(text(124, 136).trim() || "0", 8);
		at += 512 + Math.ceil(size / 512) * 512;
	}
	return entries;
}

function entriesOf(bytes: Uint8Array, filename: string): Entry[] | null {
	const name = filename.toLowerCase();
	if (name.endsWith(".zip")) return zipEntries(bytes);
	try {
		if (name.endsWith(".tar")) return tarEntries(bytes);
		return tarEntries(new Uint8Array(gunzipSync(bytes)));
	} catch {
		return null;
	}
}

/** Whether an archive's contents put it on Gmail's list. One whose contents cannot be listed counts as blocked: nothing shows it is clean. */
export function blockedArchive(bytes: Uint8Array, filename: string): boolean {
	const entries = entriesOf(bytes, filename);
	if (!entries) return true;
	return entries.some(
		(entry) =>
			blockedByName(entry.name) || (entry.encrypted && isArchive(entry.name)),
	);
}
