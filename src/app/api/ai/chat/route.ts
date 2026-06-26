import { NextRequest } from "next/server";
import { streamText, convertToModelMessages } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { decryptKey, usernameFromBearer, type AiProvider, type AiSettings } from "@/lib/ai-settings";
import type { UIMessage } from "@ai-sdk/react";

const AUTH_URL = process.env.AUTH_URL ?? "http://localhost:8081";

const SYSTEM_PROMPT = `You are an expert agile project planning assistant embedded in Togra, a project management tool.
Your role is to help teams define, refine, and break down work.

You specialise in:
- Writing clear user stories and acceptance criteria
- Breaking stories into concrete, well-scoped tasks
- Estimating story complexity and identifying risks
- Drafting definitions of done
- Identifying dependencies and ambiguities in requirements
- Suggesting approaches and technical solutions for software stories

Keep responses concise and actionable. Use markdown formatting.
Prefer bullet points and numbered lists over long prose.
Acknowledge when you are uncertain and suggest how to verify assumptions.`;

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function getRemoteSettings(authHeader: string): Promise<AiSettings | null> {
  const res = await fetch(`${AUTH_URL}/users/me/ai-settings`, {
    headers: { Authorization: authHeader },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = await res.json();
  return {
    provider: data.provider as AiProvider,
    model: data.model,
    ollamaUrl: data.ollama_url ?? undefined,
    encryptedKey: data.encrypted_key ?? undefined,
    iv: data.iv ?? undefined,
    authTag: data.auth_tag ?? undefined,
  };
}

function getDecryptedApiKey(settings: AiSettings): string | null {
  if (!settings.encryptedKey || !settings.iv || !settings.authTag) return null;
  try {
    return decryptKey(settings.encryptedKey, settings.iv, settings.authTag);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!usernameFromBearer(authHeader)) return errorResponse("Unauthorized", 401);

  const settings = await getRemoteSettings(authHeader!);
  if (!settings) {
    return errorResponse(
      "No AI provider configured. Go to AI Settings to add your API key.",
      400,
    );
  }

  const { messages, storyContext, taskContext } = (await req.json()) as {
    messages: UIMessage[];
    storyContext?: string;
    taskContext?: string;
  };

  let systemPrompt = SYSTEM_PROMPT;
  if (storyContext) {
    systemPrompt += `\n\n---\nCURRENT STORY:\n${storyContext}\n---`;
  }
  if (taskContext) {
    systemPrompt += `\n\n---\nCURRENT TASK:\n${taskContext}\n---`;
  }

  try {
    let model;

    if (settings.provider === "anthropic") {
      const apiKey = getDecryptedApiKey(settings);
      if (!apiKey) return errorResponse("No Anthropic API key configured.", 400);
      model = createAnthropic({ apiKey })(settings.model);
    } else if (settings.provider === "openai") {
      const apiKey = getDecryptedApiKey(settings);
      if (!apiKey) return errorResponse("No OpenAI API key configured.", 400);
      model = createOpenAI({ apiKey })(settings.model);
    } else if (settings.provider === "google") {
      const apiKey = getDecryptedApiKey(settings);
      if (!apiKey) return errorResponse("No Google AI API key configured.", 400);
      model = createGoogleGenerativeAI({ apiKey })(settings.model);
    } else if (settings.provider === "mistral") {
      const apiKey = getDecryptedApiKey(settings);
      if (!apiKey) return errorResponse("No Mistral API key configured.", 400);
      model = createMistral({ apiKey })(settings.model);
    } else if (settings.provider === "ollama") {
      const baseURL = (settings.ollamaUrl ?? "http://localhost:11434") + "/v1";
      model = createOpenAICompatible({ name: "ollama", baseURL })(settings.model);
    } else {
      return errorResponse("Unknown provider.", 400);
    }

    const result = streamText({
      model,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return errorResponse(message, 502);
  }
}
