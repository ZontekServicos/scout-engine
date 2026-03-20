# Railway Analysis Hotfix

Objetivo: introduzir o módulo central de `Analysis` em um banco PostgreSQL real com drift legado, sem usar `prisma migrate reset` e sem tocar nos dados existentes de `Player` e `ScoutReport`.

## Modelagem final

### Analysis

- `id`
- `type` (`COMPARISON` | `REPORT`)
- `title`
- `description` opcional
- `status` (`COMPLETED` | `IN_PROGRESS` | `ARCHIVED`)
- `analyst` opcional
- `createdAt`
- `updatedAt`
- `scout_report_id` opcional e único

### AnalysisComparison

Equivale ao conceito funcional de `AnalysisComparisonPlayer`:

- `id`
- `analysisId`
- `playerId`
- `order`

Preserva a ordem dos jogadores e vincula cada comparação a uma análise central.

## Abordagem segura com drift

Como o drift atual está em índices legados de `Player`, não use `prisma migrate dev` nem `prisma migrate reset` no banco Railway.

Aplicação recomendada:

1. Executar manualmente o SQL incremental em `prisma/manual/20260320_add_analysis_hub_incremental.sql`.
2. Verificar se `Analysis` e `AnalysisComparison` foram criadas.
3. Marcar no histórico do Prisma as migrations já refletidas manualmente.
4. Manter futuras mudanças estruturais fora do escopo de `Player` até estabilizar o drift legado.

## Aplicação

Execute o SQL do arquivo abaixo no banco Railway:

- `prisma/manual/20260320_add_analysis_hub_incremental.sql`

Esse SQL é idempotente e só cria:

- enums `AnalysisType` e `AnalysisStatus`
- tabela `Analysis`
- coluna `description`
- tabela `AnalysisComparison`
- índices e foreign keys do módulo de análises

Ele não altera índices de `Player`, não apaga dados e não faz reset.

## Sincronização do histórico do Prisma

Depois do SQL manual, marque as migrations como aplicadas:

```bash
npx prisma migrate resolve --applied 20260320110000_add_analysis_hub
npx prisma migrate resolve --applied 20260320133000_add_analysis_description
```

Isso evita que o Prisma tente reaplicar essas migrations no próximo deploy.

## Verificações pós-aplicação

```sql
SELECT to_regclass('"Analysis"');
SELECT to_regclass('"AnalysisComparison"');

SELECT column_name
FROM information_schema.columns
WHERE table_name = 'Analysis'
ORDER BY ordinal_position;

SELECT conname
FROM pg_constraint
WHERE conname IN (
  'Analysis_scout_report_id_fkey',
  'AnalysisComparison_analysisId_fkey',
  'AnalysisComparison_playerId_fkey'
);
```

Resultados esperados:

- `Analysis` existe
- `AnalysisComparison` existe
- `description` existe em `Analysis`
- `ScoutReport` continua referenciável
- `Player` continua intacta

## Impacto funcional

Com essas tabelas presentes, a tela de Análises volta a funcionar porque o backend já usa o módulo central `analysis.service.ts` e deixa de falhar por tabela ausente.
