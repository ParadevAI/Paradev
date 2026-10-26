import {
	createHmac,
	randomBytes,
	randomUUID,
	timingSafeEqual,
} from "node:crypto";
import {
	closeSync,
	constants,
	fstatSync,
	fsyncSync,
	linkSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

function missing(error: unknown) {
	return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}
function secureFile(file: string, limit: number, links = 1): Buffer {
	const fd = openSync(
		file,
		constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	);
	try {
		const st = fstatSync(fd);
		if (
			!st.isFile() ||
			st.nlink !== links ||
			st.size > limit ||
			(process.platform !== "win32" &&
				((st.mode & 0o077) !== 0 || st.uid !== process.getuid?.()))
		)
			throw new Error("Unsafe native attribution storage");
		const data = readFileSync(fd);
		if (data.length > limit)
			throw new Error("Oversized native attribution storage");
		return data;
	} finally {
		closeSync(fd);
	}
}
function writePrivate(file: string, value: Buffer) {
	const temporary = `${file}.${randomUUID()}.tmp`;
	try {
		const fd = openSync(
			temporary,
			constants.O_WRONLY |
				constants.O_CREAT |
				constants.O_EXCL |
				constants.O_NOFOLLOW,
			0o600,
		);
		try {
			writeFileSync(fd, value);
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		linkSync(temporary, file);
	} catch (error) {
		try {
			unlinkSync(temporary);
		} catch {}
		throw error;
	}
	try {
		unlinkSync(temporary);
	} catch (error) {
		if (!missing(error)) throw error;
	}
}

export class AttributionTokenAuthority {
	constructor(
		private readonly secret: Buffer,
		readonly directory?: string,
	) {}
	issue(terminalId: string): string {
		return createHmac("sha256", this.secret).update(terminalId).digest("hex");
	}
	verify(terminalId: string, token: string | undefined): boolean {
		return (
			typeof token === "string" &&
			/^[a-f0-9]{64}$/.test(token) &&
			timingSafeEqual(
				Buffer.from(token, "hex"),
				Buffer.from(this.issue(terminalId), "hex"),
			)
		);
	}
}

function recoverPublishedKey(directory: string, key: string): void {
	let original: ReturnType<typeof lstatSync>;
	try {
		original = lstatSync(key);
	} catch (error) {
		if (missing(error)) return;
		throw error;
	}
	if (original.nlink !== 2) return;
	const raw = secureFile(key, 65, 2);
	if (!/^[a-f0-9]{64}\n$/.test(raw.toString("utf8")))
		throw new Error("Invalid native attribution key; refusing to rotate it");
	const aliases = readdirSync(directory).filter((name) => {
		if (name === "key") return false;
		const candidate = lstatSync(join(directory, name));
		return candidate.dev === original.dev && candidate.ino === original.ino;
	});
	const aliasName = aliases[0];
	if (
		aliases.length !== 1 ||
		!aliasName ||
		!/^key\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/.test(
			aliasName,
		)
	)
		throw new Error("Unsafe native attribution storage");
	const alias = join(directory, aliasName);
	if (!secureFile(alias, 65, 2).equals(raw))
		throw new Error("Unsafe native attribution storage");
	for (const file of [key, alias]) {
		const current = lstatSync(file);
		if (
			current.dev !== original.dev ||
			current.ino !== original.ino ||
			current.nlink !== 2
		)
			throw new Error("Native attribution storage changed during recovery");
	}
	unlinkSync(alias);
}

export function openAttributionTokenAuthority(
	directory: string,
): AttributionTokenAuthority {
	const root = resolve(directory);
	try {
		mkdirSync(root, { mode: 0o700 });
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") throw error;
	}
	const stat = lstatSync(root);
	if (
		!stat.isDirectory() ||
		stat.isSymbolicLink() ||
		(process.platform !== "win32" &&
			((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))
	)
		throw new Error("Unsafe native attribution directory");
	const path = join(root, "key");
	recoverPublishedKey(root, path);
	let raw: Buffer;
	try {
		raw = secureFile(path, 65);
	} catch (error) {
		if (!missing(error)) throw error;
		try {
			writePrivate(path, Buffer.from(`${randomBytes(32).toString("hex")}\n`));
		} catch (createError) {
			if ((createError as NodeJS.ErrnoException)?.code !== "EEXIST")
				throw createError;
		}
		raw = secureFile(path, 65);
	}
	if (!/^[a-f0-9]{64}\n$/.test(raw.toString("utf8")))
		throw new Error("Invalid native attribution key; refusing to rotate it");
	return new AttributionTokenAuthority(
		Buffer.from(raw.toString("utf8").trim(), "hex"),
		root,
	);
}
let authority = new AttributionTokenAuthority(randomBytes(32));
let temporaryDirectory: string | undefined;
export function configureAttributionTokens(directory: string): void {
	const next = resolve(directory);
	if (authority.directory && authority.directory !== next)
		throw new Error("Native attribution host scope changed");
	authority = openAttributionTokenAuthority(next);
	temporaryDirectory = undefined;
}
export function issueAttributionToken(terminalId: string): string {
	return authority.issue(terminalId);
}
export function verifyAttributionToken(
	terminalId: string,
	token: string | undefined,
): boolean {
	return authority.verify(terminalId, token);
}

export function configureAttributionTokensForDatabase(
	dbPath: string,
	injectedDatabase = false,
): void {
	const filename = dbPath.trim();
	if (injectedDatabase || filename === "" || filename === ":memory:") return;
	const directory = join(dirname(resolve(filename)), ".native-attribution");
	if (authority.directory && authority.directory !== directory)
		throw new Error("Native attribution host scope changed");
	if (temporaryDirectory === directory) return;
	try {
		configureAttributionTokens(directory);
	} catch {
		authority = new AttributionTokenAuthority(randomBytes(32), directory);
		temporaryDirectory = directory;
		console.warn(
			"[native-attribution] Private storage is unavailable; using a host-scoped temporary authority. Existing launch tokens cannot be restored.",
		);
	}
}
