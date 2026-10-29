import { requireNativeModule } from "expo";
import type { Prompt } from "./AlertPrompt.types";

const AlertPromptModule = requireNativeModule("AlertPrompt");

export const prompt: Prompt = (options) => AlertPromptModule.prompt(options);
