# capsule-app

The real V1 of Capsule. Start with `CLAUDE.md`, then the docs in `/docs`
(`build-decisions.md` records answers given during the build).

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Checks

```bash
npm run typecheck
npm run lint
npm run format
```

## Database

The database lives in `supabase/migrations`, applied in order. The access rules
(row-level security) all go through one function, `private.can`, in
`supabase/migrations/20261111000200_permissions.sql`.

### Access tests

The tests run against a local copy of Supabase's database in Docker:

```bash
docker run -d --name capsule-db -p 54322:5432 -e POSTGRES_PASSWORD=postgres supabase/postgres:17.11.0.019
```

```bash
npm run test:db
```

`npm run test:db:report` also rewrites `docs/access-rules.md`, a plain-English
table of every rule tested. The tests rebuild the local database each run
(`npm run db:reset`), and refuse to touch anything that isn't on this machine.
