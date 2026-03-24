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
  archetype: string;
  riskScore: number;
  riskLevel: string;
  riskSummary: string;
  financialRisk: number;
  liquidityScore: number;
  capitalEfficiency: number;
  marketValue: number | null;
  growthProjection: {
    growthIndex: number;
    expectedOverallNextSeason: number;
    expectedPeak: number;
  };
}

type PlayerNarrativeResult = {
  narrative: string | null;
  recommendation: string | null;
};

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY not configured.");
    return null;
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export async function generateAIReport(data: AIReportInput): Promise<string | null> {
  const client = getOpenAIClient();
  if (!client) {
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
  if (!client) {
    return {
      narrative: null,
      recommendation: null,
    };
  }

  const cacheKey = `player_report_${data.name}_${data.position}_${data.overall}_${data.potential}_${data.riskScore.toFixed(1)}`;
  const cached = getFromCache(cacheKey);

  if (cached) {
    try {
      return JSON.parse(cached) as PlayerNarrativeResult;
    } catch {
      return {
        narrative: cached,
        recommendation: null,
      };
    }
  }

  try {
    const prompt = buildPlayerReportPrompt(data);

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an elite football scouting analyst. Always return strict JSON with keys narrative and recommendation.",
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
      return {
        narrative: null,
        recommendation: null,
      };
    }

    const parsed = JSON.parse(raw) as { narrative?: unknown; recommendation?: unknown };
    const result = {
      narrative: typeof parsed.narrative === "string" ? parsed.narrative.trim() : null,
      recommendation: typeof parsed.recommendation === "string" ? parsed.recommendation.trim() : null,
    };

    saveToCache(cacheKey, JSON.stringify(result));
    return result;
  } catch (error) {
    console.error("PLAYER REPORT GPT ERROR:", error);
    return {
      narrative: null,
      recommendation: null,
    };
  }
}
