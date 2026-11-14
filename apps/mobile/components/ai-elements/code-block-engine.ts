import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import type {
	CodeBlockEngineAvailable,
	CreateCodeBlockEngine,
} from "./code-block-engine.types";

export const createCodeBlockEngine: CreateCodeBlockEngine = () =>
	createJavaScriptRegexEngine();

export const codeBlockEngineAvailable: CodeBlockEngineAvailable = () => true;
