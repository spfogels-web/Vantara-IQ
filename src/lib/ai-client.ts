import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { orgSettings } from "@/lib/org-settings";

/**
 * The only place a model client is constructed.
 *
 * Six call sites used to build their own — rate extraction, map reading, the
 * daily importer, both locate assistants, the operations assistant. Each one
 * is an outbound request carrying this organisation's records to somebody
 * else's computer, and a demonstration organisation must make none of them.
 *
 * A rule applied at six exits is not a rule, so there is one exit now. A test
 * asserts that `new Anthropic(` appears nowhere else in the codebase, which is
 * what keeps a seventh from quietly appearing.
 */

export class AiNotAllowed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiNotAllowed";
  }
}

/** A model client, or a refusal. Never a client this organisation may not use. */
export async function aiClient(): Promise<Anthropic> {
  const settings = await orgSettings();
  if (!settings.aiAllowed) {
    throw new AiNotAllowed(
      settings.isDemo
        ? "This is a demonstration organisation. It makes no outbound model requests."
        : settings.configured
          ? "The assistant is not enabled for this organisation."
          : "This organisation has no settings, so the assistant is off until it does.",
    );
  }
  return new Anthropic();
}

/** Whether to offer a model-backed feature at all, without constructing one. */
export async function aiAvailable(): Promise<boolean> {
  return (await orgSettings()).aiAllowed;
}
