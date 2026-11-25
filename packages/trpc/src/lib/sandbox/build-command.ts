export const BUILD_COMMANDS_DIR = "/tmp/superset-build";
/** What `timeout` exits with when it stops a command. */
export const TIMED_OUT_EXIT_CODE = 124;
const TAIL_LINES = 40;
const RUNNING = "running";

function quote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function buildCommandDir(key: string): string {
	if (!/^[a-z0-9-]+$/.test(key))
		throw new Error(`Bad build command key ${key}`);
	return `${BUILD_COMMANDS_DIR}/${key}`;
}

/**
 * Runs `script` once per directory: `mkdir` is atomic, so a second start of
 * the same key exits at once. The exit code is written last, by rename, so a
 * reader never sees half of it.
 */
export function detachedCommandScript(args: {
	dir: string;
	script: string;
	timeoutSeconds: number;
}): string {
	const dir = quote(args.dir);
	const seconds = Math.max(1, Math.floor(args.timeoutSeconds));
	return [
		`mkdir -p "$(dirname ${dir})"`,
		`mkdir ${dir} 2>/dev/null || exit 0`,
		`timeout -k 10 ${seconds} bash -lc ${quote(args.script)} > ${dir}/output 2>&1`,
		`echo $? > ${dir}/exit.tmp`,
		`mv ${dir}/exit.tmp ${dir}/exit`,
	].join("\n");
}

export function readCommandScript(dir: string): string {
	const quoted = quote(dir);
	return [
		`if [ -f ${quoted}/exit ]; then cat ${quoted}/exit; else echo ${RUNNING}; fi`,
		`tail -n ${TAIL_LINES} ${quoted}/output 2>/dev/null || true`,
	].join("\n");
}

export function parseCommandState(stdout: string): {
	exitCode: number | null;
	tail: string;
} {
	const newline = stdout.indexOf("\n");
	const head = (newline === -1 ? stdout : stdout.slice(0, newline)).trim();
	const tail = newline === -1 ? "" : stdout.slice(newline + 1).trimEnd();
	if (head === RUNNING) return { exitCode: null, tail };
	const exitCode = Number.parseInt(head, 10);
	if (Number.isNaN(exitCode)) {
		throw new Error(`Unreadable build command state: ${head}`);
	}
	return { exitCode, tail };
}
