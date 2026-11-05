import { strict as assert } from "node:assert";
import childProcess from "node:child_process";
import { once } from "node:events";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	clearStrictShellEnvCache,
	getStrictShellEnvironment,
} from "./clean-shell-env.ts";
import { __setAccountShellForTesting } from "./user-shell.ts";

const canRunRealShell =
	process.platform !== "win32" &&
	existsSync("/bin/zsh") &&
	existsSync("/usr/bin/perl");

test(
	"shell exit releases both pipes while an rc-spawned daemon holds their write ends",
	{ skip: !canRunRealShell, timeout: 5_000 },
	async (t) => {
		const home = mkdtempSync(join(tmpdir(), "clean-shell-env-"));
		const originalHome = process.env.HOME;
		const spawnSpy = t.mock.method(childProcess, "spawn");
		// Observe the real child through the product's named ESM spawn binding.
		syncBuiltinESMExports();
		t.after(() => {
			spawnSpy.mock.restore();
			syncBuiltinESMExports();
			__setAccountShellForTesting(undefined);
			if (originalHome === undefined) delete process.env.HOME;
			else process.env.HOME = originalHome;
			clearStrictShellEnvCache();
			try {
				const pid = Number(readFileSync(join(home, "holder.pid"), "utf8"));
				if (Number.isSafeInteger(pid) && pid > 0) process.kill(pid);
			} catch {}
			for (const call of spawnSpy.mock.calls) call.result?.kill();
			rmSync(home, { recursive: true, force: true });
		});
		// The detached fixture keeps the pipes open after the shell exits.
		writeFileSync(
			join(home, ".zshrc"),
			`/usr/bin/perl -e 'use POSIX; POSIX::setsid(); sleep 30' &\necho $! > "${home}/holder.pid"\n`,
		);
		process.env.HOME = home;
		__setAccountShellForTesting("/bin/zsh");
		clearStrictShellEnvCache();

		const env = await getStrictShellEnvironment();
		assert.equal(env.HOME, home);
		assert.equal(spawnSpy.mock.callCount(), 1);
		const child = spawnSpy.mock.calls[0]?.result;
		assert.ok(child?.stdout);
		assert.ok(child.stderr);
		for (const pipe of [child.stdout, child.stderr]) {
			assert.equal(pipe.destroyed, true, "the shell pipe must be destroyed");
			if (!pipe.closed) await once(pipe, "close", { signal: t.signal });
			assert.equal(pipe.closed, true);
		}
		const holderPid = Number(readFileSync(join(home, "holder.pid"), "utf8"));
		assert.ok(Number.isSafeInteger(holderPid) && holderPid > 0);
		assert.doesNotThrow(() => process.kill(holderPid, 0));
	},
);
