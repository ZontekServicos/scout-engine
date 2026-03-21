SELECT to_regclass('public."Analysis"') AS analysis_table;
SELECT to_regclass('public."AnalysisComparison"') AS analysis_comparison_table;

SELECT t.typname AS enum_name
FROM pg_type t
WHERE t.typname IN ('AnalysisType', 'AnalysisStatus')
ORDER BY t.typname;

SELECT c.table_name, c.column_name, c.data_type, c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('Analysis', 'AnalysisComparison')
ORDER BY c.table_name, c.ordinal_position;

SELECT conname, contype
FROM pg_constraint
WHERE conname IN (
  'Analysis_scout_report_id_fkey',
  'AnalysisComparison_analysisId_fkey',
  'AnalysisComparison_playerId_fkey'
)
ORDER BY conname;

SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'Analysis_scout_report_id_key',
    'Analysis_type_idx',
    'Analysis_createdAt_idx',
    'Analysis_status_idx',
    'AnalysisComparison_analysisId_idx',
    'AnalysisComparison_playerId_idx',
    'AnalysisComparison_analysisId_order_key',
    'AnalysisComparison_analysisId_playerId_key'
  )
ORDER BY indexname;

SELECT migration_name, finished_at
FROM "_prisma_migrations"
WHERE migration_name IN (
  '20260320110000_add_analysis_hub',
  '20260320133000_add_analysis_description'
)
ORDER BY migration_name;
