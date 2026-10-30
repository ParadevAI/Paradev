import type { RegexEngine } from "@shikijs/core";

/** The regex engine Shiki tokenizes with on this platform. */
export type CreateCodeBlockEngine = () => RegexEngine;

/** False where the engine cannot run, and code stays plain text. */
export type CodeBlockEngineAvailable = () => boolean;
