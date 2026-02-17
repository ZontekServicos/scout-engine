import OpenAI from "openai";
import { buildScoutPrompt } from "./scout.prompt";
import { getFromCache, saveToCache } from "./ai.cache";

interface AIReportInput {
  playerA: {
    id: string;
    name: string;
  };
  playerB: {
    id: string;
    name: string;
  };
  qualitative: any;
  quantitative: any;
}

export async function generateAIReport(data: AIReportInput): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY not configured.");
    return null;
  }

  const cacheKey = `compare_${data.playerA.id}_${data.playerB.id}`;

  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log("🧠 AI CACHE HIT");
    return cached;
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = buildScoutPrompt(data);

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an elite professional football scout analyst. Provide objective, technical and concise performance analysis.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.5,
      max_tokens: 350,
    });

    const text = response.choices?.[0]?.message?.content?.trim() ?? null;

    if (text) {
      saveToCache(cacheKey, text);
    }

    return text;
  } catch (error) {
    console.error("❌ GPT ERROR:", error);
    return null;
  }
}
