import { requireNativeModule } from "expo";
import type { AlertPromptHostComponent, Prompt } from "./AlertPrompt.types";

const AlertPromptModule = requireNativeModule("AlertPrompt");

export const prompt: Prompt = (options) => AlertPromptModule.prompt(options);

export const AlertPromptHost: AlertPromptHostComponent = () => null;
