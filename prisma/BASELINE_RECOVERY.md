## Prisma Baseline Strategy For The Active Railway Database

This project already has a real PostgreSQL database with production data and a local `prisma/migrations` history, but the active database is missing `_prisma_migrations`.

The safest recovery path is:

1. Take a database backup or Railway snapshot before any migration metadata change.
2. Verify that the active database already contains the structures represented by the local Prisma migrations.
3. Do **not** run old migrations with `prisma migrate deploy` while `_prisma_migrations` is missing.
4. Recreate Prisma migration tracking by marking every existing migration directory as already applied with `prisma migrate resolve --applied <migration_name>`.
5. After all historical migrations are marked as applied, run `prisma migrate deploy` only for future migrations.

Recommended validation before baseline:

```powershell
npm run db:check
```

Recommended baseline sequence:

```powershell
cmd /c npx prisma migrate resolve --applied 20260209202908_init_scout_engine
cmd /c npx prisma migrate resolve --applied 20260220203405_add_risk_field
cmd /c npx prisma migrate resolve --applied 20260224211814_add_governance_layer
cmd /c npx prisma migrate resolve --applied 20260305170500_player_real_scouting_import
cmd /c npx prisma migrate resolve --applied 20260305173000_player_positions_array
cmd /c npx prisma migrate resolve --applied 20260305210224_npx_prisma_migrate_deploy
cmd /c npx prisma migrate resolve --applied 20260309001000_add_player_image_path
cmd /c npx prisma migrate resolve --applied 20260309113000_add_player_filter_indexes
cmd /c npx prisma migrate resolve --applied 20260312195000_add_player_source_metadata
cmd /c npx prisma migrate resolve --applied 20260319120000_add_player_analytics_snapshots
```

Post-baseline validation:

```powershell
cmd /c npx prisma migrate status
npm run db:check
```

Why this is the safest option:

- It preserves all existing data.
- It does not recreate legacy tables that already exist.
- It restores Prisma's migration ledger without replaying destructive or redundant SQL.
- It keeps the current migration history usable for all future environments and deploys.
