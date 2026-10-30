import {
	createNativeEngine,
	isNativeEngineAvailable,
} from "react-native-shiki-engine";
import type {
	CodeBlockEngineAvailable,
	CreateCodeBlockEngine,
} from "./code-block-engine.types";

export const createCodeBlockEngine: CreateCodeBlockEngine = createNativeEngine;

export const codeBlockEngineAvailable: CodeBlockEngineAvailable =
	isNativeEngineAvailable;
