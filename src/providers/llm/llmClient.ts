/**
 * Low-level LLM JSON client. Lazy-imports the chosen SDK so neither is a hard
 * dependency. Returns parsed JSON from the model. Charges the cost controller.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CostController } from '../../core/cost.ts';
import { log } from '../../core/logger.ts';

const execFileAsync = promisify(execFile);

/**
 * Parse JSON from an LLM response, tolerating code fences AND surrounding prose
 * (e.g. "Looking at these keywords… {json}"). Prose-wrapped JSON is the #1 cause of
 * parse failures — and a failed parse forces a weaker fallback path — so we recover
 * the first {...} / [...] block instead of giving up.
 */
function parseLlmJson(s: string): unknown {
  const cleaned = s.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[{[]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new SyntaxError('LLM response contained no parseable JSON');
  }
}

/**
 * Route a call through headless Claude Code (`claude -p`), which bills to the
 * user's Claude SUBSCRIPTION instead of pay-as-you-go API credits. ANTHROPIC_API_KEY
 * is removed from the child env so Claude Code uses subscription (OAuth) auth.
 * Throws on any failure so the caller falls back to the API.
 */
async function callViaClaudeCode(model: string, system: string, user: string): Promise<unknown> {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  const { stdout } = await execFileAsync(
    'claude',
    ['-p', `${system}\n\n${user}`, '--model', model, '--max-turns', '1'],
    { env, timeout: 180_000, maxBuffer: 16 * 1024 * 1024 },
  );
  return parseLlmJson(stdout);
}

export async function callLlmJson(opts: {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model: string;
  system: string;
  user: string;
  cost: CostController;
}): Promise<unknown> {
  const { provider, apiKey, model, system, user, cost } = opts;
  cost.chargeLlm(0.05, `llm.${provider}`);
  // Prefer the Claude subscription (headless Claude Code) when enabled; the API key
  // is the automatic fallback if the CLI is missing, errors, or returns no JSON.
  if (provider === 'anthropic' && process.env.LLM_VIA_CLAUDE_CODE === 'true') {
    try {
      return await callViaClaudeCode(model, system, user);
    } catch (err) {
      log.warn('claude-code (subscription) call failed — falling back to API', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (provider === 'anthropic') {
    let Anthropic: any;
    try {
      const mod = '@anthropic-ai/sdk';
      Anthropic = (await import(/* @vite-ignore */ mod)).default;
    } catch {
      throw new Error('@anthropic-ai/sdk not installed. Run `npm i @anthropic-ai/sdk` or set LLM_PROVIDER=deterministic.');
    }
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = (res.content ?? []).map((b: any) => b.text ?? '').join('');
    return parseLlmJson(text);
  }
  // openai
  let OpenAI: any;
  try {
    const mod = 'openai';
    OpenAI = (await import(/* @vite-ignore */ mod)).default;
  } catch {
    throw new Error('openai not installed. Run `npm i openai` or set LLM_PROVIDER=deterministic.');
  }
  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const text = res.choices?.[0]?.message?.content ?? '{}';
  return parseLlmJson(text);
}
