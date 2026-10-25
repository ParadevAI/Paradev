import { expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Build-time dependency audit; never imported by a renderer.
import { existsSync, readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: Build-time dependency audit; never imported by a renderer.
import { dirname, resolve } from "node:path";
import ts from "@typescript/typescript6";

test("usage surfaces do not require the main-window IPC bridge or stores", () => {
	const renderer = resolve(import.meta.dir, "..");
	const seen = new Set<string>();
	const visit = (file: string) => {
		if (seen.has(file)) return;
		seen.add(file);
		expect(file).not.toContain(`${renderer}/stores/`);
		expect(file).not.toContain(`${renderer}/lib/trpc-client`);
		expect(file).not.toContain(`${renderer}/lib/electron-trpc`);
		expect(file).not.toContain(`${renderer}/lib/host-service-client`);
		expect(file).not.toContain(`${renderer}/providers/`);
		expect(file).not.toContain(`${renderer}/routes/`);
		const source = ts.createSourceFile(
			file,
			readFileSync(file, "utf8"),
			ts.ScriptTarget.Latest,
			true,
		);
		for (const node of source.statements) {
			if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node))
				continue;
			if (
				(ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) ||
				(ts.isExportDeclaration(node) && node.isTypeOnly) ||
				!node.moduleSpecifier ||
				!ts.isStringLiteral(node.moduleSpecifier)
			)
				continue;
			const name = node.moduleSpecifier.text;
			expect(name).not.toBe("trpc-electron/renderer");
			expect(name).not.toBe("@tanstack/react-router");
			if (!name.startsWith(".") && !name.startsWith("renderer/")) continue;
			if (name.endsWith(".css")) continue;
			const base = name.startsWith("renderer/")
				? resolve(renderer, name.slice(9))
				: resolve(dirname(file), name);
			const target = [
				base,
				`${base}.ts`,
				`${base}.tsx`,
				`${base}/index.ts`,
				`${base}/index.tsx`,
			].find((path) => /\.tsx?$/.test(path) && existsSync(path));
			if (!target) throw new Error(`Unresolved widget dependency: ${name}`);
			visit(target);
		}
	};
	visit(resolve(import.meta.dir, "index.tsx"));
	expect(seen.size).toBeGreaterThan(5);
});

test("the usage document has its own mount and denies network connections", () => {
	const html = readFileSync(
		resolve(import.meta.dir, "../usage-widget.html"),
		"utf8",
	);
	expect(html).toContain('id="usage-root"');
	expect(html).toContain('src="/usage-widget/index.tsx"');
	const policy = html.match(
		/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/,
	)?.[1];
	expect(policy).toBeDefined();
	const directives = new Map(
		policy?.split(";").map((value) => {
			const [directive, ...sources] = value.trim().split(/\s+/);
			return [directive ?? "", sources] as const;
		}),
	);
	expect(directives.get("default-src")).toEqual(["'self'"]);
	expect(directives.get("script-src")).toEqual(["'self'"]);
	expect(directives.get("connect-src")).toEqual(["'none'"]);
});
