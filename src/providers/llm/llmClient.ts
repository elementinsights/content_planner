/**
 * Low-level LLM JSON client. Lazy-imports the chosen SDK so neither is a hard
 * dependency. Returns parsed JSON from the model. Charges the cost controller.
 */
import type { CostController } from '../../core/cost.ts';

function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
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
    return JSON.parse(stripFences(text));
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
  return JSON.parse(stripFences(text));
}
