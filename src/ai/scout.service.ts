import OpenAI from "openai";
import { buildPlayerReportPrompt } from "./player-report.prompt";
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

interface PlayerNarrativeInput {
  name: string;
  position: string;
  age: number;
  club: string;
  league: string;
  overall: number;
  potential: number;
  tier: string;
  archetype?: string;
  riskScore: number;
  riskLevel: string;
  liquidityScore: number;
  capitalEfficiency: number;
  marketValue: number;
}

type PlayerNarrativeResult = {
  narrative: string | null;
  recommendation: string | null;
};

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured.");
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export async function generateAIReport(data: AIReportInput): Promise<string | null> {
  let client: OpenAI;

  try {
    client = getOpenAIClient();
  } catch (error) {
    console.error("COMPARE GPT ERROR:", error);
    return null;
  }

  const cacheKey = `compare_${data.playerA.id}_${data.playerB.id}`;

  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log("🧠 AI CACHE HIT");
    return cached;
  }

  try {
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

export async function generatePlayerNarrativeReport(data: PlayerNarrativeInput): Promise<PlayerNarrativeResult> {
  const client = getOpenAIClient();

  const cacheKey = `player_report_${data.name}_${data.position}_${data.overall}_${data.potential}_${data.riskScore.toFixed(1)}`;
  const cached = getFromCache(cacheKey);

  if (cached) {
    if (cached.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(cached) as { narrative?: unknown; recommendation?: unknown };
        const cachedNarrative = typeof parsed.narrative === "string" ? parsed.narrative.trim() : "";
        const cachedRecommendation = typeof parsed.recommendation === "string" ? parsed.recommendation.trim() : "";

        if (cachedNarrative) {
          const cachedParagraphs = cachedNarrative.split(/\n{2,}/).filter(Boolean);
          return {
            narrative: cachedNarrative,
            recommendation: cachedRecommendation || cachedParagraphs[cachedParagraphs.length - 1] || null,
          };
        }
      } catch {
        // Falls through to plain-text cache handling below.
      }
    }

    const cachedParagraphs = cached.split(/\n{2,}/).filter(Boolean);
    return {
      narrative: cached,
      recommendation: cachedParagraphs[cachedParagraphs.length - 1] || null,
    };
  }

  try {
    const prompt = buildPlayerReportPrompt(data);

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Voce e um analista senior de scouting esportivo. Responda em portugues com exatamente 4 paragrafos corridos e sem titulos.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.4,
      max_tokens: 700,
    });

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      throw new Error("OpenAI returned an empty narrative for player report.");
    }

    const paragraphs = raw.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
    if (paragraphs.length !== 4) {
      throw new Error(`OpenAI returned ${paragraphs.length} paragraphs instead of 4.`);
    }

    saveToCache(cacheKey, raw);
    return {
      narrative: raw,
      recommendation: paragraphs[3] ?? null,
    };
  } catch (error) {
    console.error("PLAYER REPORT GPT ERROR:", error);
    throw error;
  }
}
