/**
 * validate-api.ts — Diagnóstico real da Sportmonks API
 *
 * O que este script testa:
 *   1. Fixtures por liga — filters=league_id:X (rota principal do sistema)
 *   2. Events via endpoint separado — /events?filters=fixture_id:X
 *   3. Events inline via include=events na fixture request
 *   4. Qualidade dos dados: presença de coordinates (x/y)
 *   5. Multi-liga: compara resultados entre ligas configuradas
 *
 * Como rodar:
 *   npx ts-node src/scripts/validate-api.ts
 *   npx ts-node src/scripts/validate-api.ts --debug    ← mostra JSON bruto
 *   npx ts-node src/scripts/validate-api.ts --leagues  ← compara múltiplas ligas
 *
 * Variável de ambiente necessária: SPORTMONKS_API_TOKEN
 *
 * Interpretação dos resultados:
 *   ✅ withEvents > 0 + withCoordinates > 0  → tudo funcionando, dados ricos
 *   ⚠  withEvents > 0 + withCoordinates = 0  → dados básicos, plano sem coords
 *   ❌  withEvents = 0                        → API não retorna eventos para esta liga/plano
 *   ❌  fixtures = 0                          → filtro de liga não funciona / liga inexistente
 */

import * as dotenv from "dotenv";
import * as path from "path";
import {
  fetchFixturesByLeague,
  fetchMatchEvents,
  buildFilters,
  buildInclude,
} from "../integrations/sportmonks/sportmonks.client";
import type { SportmonksFixture, SportmonksEvent } from "../integrations/sportmonks/sportmonks.types";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const LEAGUES_TO_TEST = [
  { id: 2,   name: "UEFA Champions League" },
  { id: 5,   name: "UEFA Europa League"    },
  { id: 82,  name: "UEFA Conference League" },
  { id: 8,   name: "Premier League"        },
  { id: 564, name: "Brasileirão Série A"   },
];

const DEFAULT_LEAGUE_ID = 2;
const MAX_PAGES         = 2;     // limite de páginas para não gastar rate limit
const MAX_EVENT_PROBES  = 3;     // máximo de fixtures para buscar eventos individuais
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "FT_PEN", "FINISHED"]);

const DEBUG   = process.argv.includes("--debug");
const MULTI   = process.argv.includes("--leagues");

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

interface FixtureQuality {
  totalFixtures:       number;
  finishedFixtures:    number;
  withInlineEvents:    number;   // events[] presente na própria fixture
  withSeparateEvents:  number;   // events via /events?filters=fixture_id
  withCoordinates:     number;   // eventos com x/y via endpoint separado
  pctWithInlineEvents: string;
  pctWithSeparateEvents: string;
  pctWithCoordinates:  string;
  sampleFixtureId:     number | null;
  sampleEventCount:    number;
  sampleCoordCount:    number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveStatus(state: SportmonksFixture["state"]): string {
  if (!state) return "";
  if (typeof state === "string") return state.toUpperCase();
  return (state.short_name ?? state.developer_name ?? state.state ?? "").toUpperCase();
}

function isFinished(f: SportmonksFixture): boolean {
  return FINISHED_STATUSES.has(resolveStatus(f.state));
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function line(char = "─", n = 60): string {
  return char.repeat(n);
}

// ---------------------------------------------------------------------------
// Step 1 — Fixtures com includes padrão (sem events inline)
// ---------------------------------------------------------------------------

async function fetchFixturesForValidation(leagueId: number): Promise<SportmonksFixture[]> {
  console.log(`\n[1/4] Buscando fixtures — leagueId=${leagueId}, maxPages=${MAX_PAGES}…`);
  const fixtures = await fetchFixturesByLeague(leagueId, MAX_PAGES);
  console.log(`      → ${fixtures.length} fixtures recebidas`);
  return fixtures;
}

// ---------------------------------------------------------------------------
// Step 2 — Events via endpoint separado (/events?filters=fixture_id:X)
// ---------------------------------------------------------------------------

async function probeEventsEndpoint(
  finishedFixtures: SportmonksFixture[],
): Promise<{ fixtureId: number; events: SportmonksEvent[] } | null> {
  const probes = finishedFixtures.slice(0, MAX_EVENT_PROBES);

  console.log(`\n[2/4] Testando /events endpoint em ${probes.length} fixtures finalizadas…`);

  for (const fixture of probes) {
    try {
      const events = await fetchMatchEvents(fixture.id);
      console.log(`      fixture #${fixture.id} → ${events.length} eventos`);
      if (events.length > 0) return { fixtureId: fixture.id, events };
    } catch (err) {
      console.warn(`      fixture #${fixture.id} → erro: ${(err as Error).message.split("\n")[0]}`);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Step 3 — Fixtures com include=events (inline, alternativa ao endpoint)
// ---------------------------------------------------------------------------

async function fetchFixturesWithInlineEvents(
  leagueId: number,
): Promise<SportmonksFixture[]> {
  console.log(`\n[3/4] Testando fixtures com include=events inline…`);

  // Importa o núcleo interno do client para montar a URL manualmente
  // com include=participants;scores;state;events
  const token = process.env.SPORTMONKS_API_TOKEN!;
  const url = new URL("https://api.sportmonks.com/v3/football/fixtures");
  url.searchParams.set("api_token", token);
  url.searchParams.set("filters", buildFilters({ league_id: leagueId }));
  url.searchParams.set("include", buildInclude(["participants", "scores", "state", "events"]));
  url.searchParams.set("per_page", "25");
  url.searchParams.set("page", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", Authorization: token },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`      HTTP ${res.status} — ${body.slice(0, 200)}`);
      console.warn("      [DIAGNOSTIC] include=events não suportado neste plano/endpoint");
      return [];
    }

    const json = await res.json() as { data?: SportmonksFixture[] };
    const fixtures = json.data ?? [];
    const withEvents = fixtures.filter((f) => (f.events?.length ?? 0) > 0).length;
    console.log(`      → ${fixtures.length} fixtures, ${withEvents} com events inline`);
    return fixtures;
  } catch (err) {
    console.warn(`      Erro ao buscar fixtures com events: ${(err as Error).message.split("\n")[0]}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Step 4 — analyzeFixtures: métricas de qualidade
// ---------------------------------------------------------------------------

function analyzeFixtures(
  fixtures: SportmonksFixture[],
  inlineFixtures: SportmonksFixture[],
  separateEventProbe: { fixtureId: number; events: SportmonksEvent[] } | null,
  finishedCount: number,
): FixtureQuality {
  // Events inline (via include=events)
  const withInlineEvents = inlineFixtures.filter(
    (f) => (f.events?.length ?? 0) > 0,
  ).length;

  // Coordinates via separate endpoint
  let withCoordinates = 0;
  let sampleEventCount = 0;
  let sampleCoordCount = 0;

  if (separateEventProbe) {
    sampleEventCount = separateEventProbe.events.length;
    sampleCoordCount = separateEventProbe.events.filter(
      (e) => e.coordinates?.x != null || e.coordinates?.y != null,
    ).length;
    if (sampleCoordCount > 0) withCoordinates = 1;
  }

  return {
    totalFixtures:         fixtures.length,
    finishedFixtures:      finishedCount,
    withInlineEvents,
    withSeparateEvents:    separateEventProbe ? 1 : 0,
    withCoordinates,
    pctWithInlineEvents:   pct(withInlineEvents, inlineFixtures.length),
    pctWithSeparateEvents: separateEventProbe ? "✓" : "0%",
    pctWithCoordinates:    sampleCoordCount > 0
      ? pct(sampleCoordCount, sampleEventCount) + " dos eventos da amostra"
      : "0%",
    sampleFixtureId:   separateEventProbe?.fixtureId ?? null,
    sampleEventCount,
    sampleCoordCount,
  };
}

// ---------------------------------------------------------------------------
// Diagnósticos
// ---------------------------------------------------------------------------

function printDiagnostics(quality: FixtureQuality, leagueName: string): void {
  console.log(`\n${line()}`);
  console.log(`RESULTADO — ${leagueName}`);
  console.log(line());
  console.log(`  Fixtures totais         : ${quality.totalFixtures}`);
  console.log(`  Fixtures finalizadas    : ${quality.finishedFixtures}`);
  console.log(`  Events inline (include) : ${quality.withInlineEvents} (${quality.pctWithInlineEvents})`);
  console.log(`  Events via /events API  : ${quality.sampleEventCount} (fixture #${quality.sampleFixtureId ?? "n/a"})`);
  console.log(`  Com coordenadas (x/y)   : ${quality.sampleCoordCount}/${quality.sampleEventCount} = ${quality.pctWithCoordinates}`);
  console.log(line());

  // Diagnósticos automáticos
  if (quality.totalFixtures === 0) {
    console.log("❌ [DIAGNOSTIC] Nenhuma fixture retornada");
    console.log("   → Verifique se o leagueId existe e se o filtro league_id é suportado no seu plano");
    return;
  }

  if (quality.finishedFixtures === 0) {
    console.log("⚠  [DIAGNOSTIC] Nenhuma fixture finalizada encontrada");
    console.log("   → Tente uma liga de temporada histórica ou aumente maxPages");
  }

  if (quality.sampleEventCount === 0) {
    console.log("❌ [DIAGNOSTIC] API returned fixtures without events");
    console.log("   → Causas prováveis:");
    console.log("     1. Plano Sportmonks não inclui eventos para esta liga");
    console.log("     2. Liga não possui dados de eventos historicizados");
    console.log("     3. Fixtures probed são pré-temporada / não jogadas");
  } else if (quality.sampleCoordCount === 0) {
    console.log("⚠  [DIAGNOSTIC] Events found but no coordinates (plan limitation or league limitation)");
    console.log("   → Eventos existem mas sem x/y:");
    console.log("     1. Plano atual não inclui dados espaciais");
    console.log("     2. Liga não tem tracking de coordenadas");
    console.log("     3. Coordenadas disponíveis apenas em ligas premium (UCL, PL, La Liga, etc.)");
  } else {
    console.log("✅ [DIAGNOSTIC] Dados ricos confirmados — eventos com coordenadas disponíveis");
    console.log(`   → ${quality.sampleCoordCount}/${quality.sampleEventCount} eventos com x/y na amostra`);
  }

  if (quality.withInlineEvents === 0 && quality.sampleEventCount > 0) {
    console.log("\n💡 Events NÃO vêm inline nas fixtures (include=events não funciona)");
    console.log("   → Sistema correto: buscar via /events?filters=fixture_id:X separadamente");
  } else if (quality.withInlineEvents > 0) {
    console.log("\n💡 Events DISPONÍVEIS inline — pode usar include=events para reduzir chamadas");
  }
}

// ---------------------------------------------------------------------------
// Debug: raw JSON da primeira fixture
// ---------------------------------------------------------------------------

function debugRawFixture(fixtures: SportmonksFixture[]): void {
  if (fixtures.length === 0) {
    console.log("\n[DEBUG] Nenhuma fixture para inspecionar.");
    return;
  }
  console.log("\n[DEBUG] Primeira fixture (JSON bruto):");
  console.log(JSON.stringify(fixtures[0], null, 2));
}

// ---------------------------------------------------------------------------
// Single league validation
// ---------------------------------------------------------------------------

async function validateLeague(
  leagueId: number,
  leagueName: string,
): Promise<FixtureQuality> {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`VALIDANDO: ${leagueName} (id=${leagueId})`);
  console.log("═".repeat(60));

  // 1 — Fixtures padrão
  const fixtures = await fetchFixturesForValidation(leagueId);

  // 2 — Events via endpoint separado (para fixtures finalizadas)
  const finished = fixtures.filter(isFinished);
  console.log(`      → ${finished.length} finalizadas de ${fixtures.length} totais`);

  const eventProbe = finished.length > 0
    ? await probeEventsEndpoint(finished)
    : null;

  if (eventProbe === null && finished.length > 0) {
    console.log("      [DIAGNOSTIC] API returned fixtures without events");
  }

  // 3 — Fixtures com events inline
  const inlineFixtures = await fetchFixturesWithInlineEvents(leagueId);

  // 4 — Análise e diagnóstico
  const quality = analyzeFixtures(fixtures, inlineFixtures, eventProbe, finished.length);
  printDiagnostics(quality, leagueName);

  if (DEBUG) debugRawFixture(fixtures);

  return quality;
}

// ---------------------------------------------------------------------------
// Multi-league comparison
// ---------------------------------------------------------------------------

async function runMultiLeague(): Promise<void> {
  console.log("\n" + "═".repeat(60));
  console.log("COMPARAÇÃO MULTI-LIGA");
  console.log("═".repeat(60));

  const results: Array<{ league: string; quality: FixtureQuality }> = [];

  for (const league of LEAGUES_TO_TEST) {
    try {
      const quality = await validateLeague(league.id, league.name);
      results.push({ league: league.name, quality });
    } catch (err) {
      console.error(`\nErro ao validar ${league.name}: ${(err as Error).message.split("\n")[0]}`);
      results.push({
        league: league.name,
        quality: {
          totalFixtures: 0, finishedFixtures: 0,
          withInlineEvents: 0, withSeparateEvents: 0, withCoordinates: 0,
          pctWithInlineEvents: "erro", pctWithSeparateEvents: "erro",
          pctWithCoordinates: "erro",
          sampleFixtureId: null, sampleEventCount: 0, sampleCoordCount: 0,
        },
      });
    }
  }

  // Tabela de comparação
  console.log("\n" + "═".repeat(60));
  console.log("RESUMO COMPARATIVO");
  console.log("═".repeat(60));
  console.log(
    "Liga".padEnd(30) +
    "Fixtures".padStart(10) +
    "Events".padStart(10) +
    "Coords".padStart(10),
  );
  console.log("─".repeat(60));

  for (const { league, quality } of results) {
    const eventsStr = quality.sampleEventCount > 0
      ? `${quality.sampleEventCount}`
      : "✗";
    const coordsStr = quality.sampleCoordCount > 0
      ? `${quality.sampleCoordCount}/${quality.sampleEventCount}`
      : "✗";
    console.log(
      league.slice(0, 29).padEnd(30) +
      String(quality.totalFixtures).padStart(10) +
      eventsStr.padStart(10) +
      coordsStr.padStart(10),
    );
  }

  // Liga mais rica em dados
  const richest = results.filter((r) => r.quality.sampleCoordCount > 0);
  if (richest.length > 0) {
    console.log(`\n✅ Ligas com coordenadas: ${richest.map((r) => r.league).join(", ")}`);
  } else {
    const withEvents = results.filter((r) => r.quality.sampleEventCount > 0);
    if (withEvents.length > 0) {
      console.log(`\n⚠  Ligas com eventos (sem coords): ${withEvents.map((r) => r.league).join(", ")}`);
    } else {
      console.log("\n❌ Nenhuma liga retornou eventos — verifique plano e token");
    }
  }
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token) {
    console.error("❌ SPORTMONKS_API_TOKEN não definido em .env");
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║          SPORTMONKS API — VALIDAÇÃO REAL DE DADOS       ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`Token: …${token.slice(-8)}  |  Mode: ${MULTI ? "multi-liga" : "single liga"}${DEBUG ? " + debug" : ""}`);

  try {
    if (MULTI) {
      await runMultiLeague();
    } else {
      const league = LEAGUES_TO_TEST.find((l) => l.id === DEFAULT_LEAGUE_ID)
        ?? { id: DEFAULT_LEAGUE_ID, name: `League #${DEFAULT_LEAGUE_ID}` };
      await validateLeague(league.id, league.name);
    }
  } catch (err) {
    console.error("\n❌ Erro fatal:");
    console.error((err as Error).message);
    process.exit(1);
  }

  console.log("\n" + "═".repeat(60));
  console.log("Validação concluída.");
  console.log("Próximos passos:");
  console.log("  --debug    ver JSON bruto da primeira fixture");
  console.log("  --leagues  comparar todas as ligas configuradas");
  console.log("═".repeat(60));
}

main();
