# API service deployment

The API runs as the `api` service in the Railway `criterion-api` project. Its
production URL is `https://search.sunnah-stories.com`.

Railway reads application code from `subaanqasim/criterion`, branch `main`, with
`api-service` as the service root. The Railway GitHub App sends push events to
Railway. A change to the API build context starts a production deployment.
Railway may skip a commit when `api-service` has not changed.

## Deploy an application change

Run the API checks before pushing:

```bash
pnpm --dir api-service check
```

Commit the change and push it to `main`. No separate deployment command is
needed. Railway builds the commit and reports the Git commit in the deployment
history.

The release runs in this order:

1. Railpack installs Node.js and pnpm, then installs dependencies from
   `api-service/pnpm-lock.yaml`.
2. Railway runs `pnpm build` to compile TypeScript into `dist/`.
3. Railway runs `pnpm db:migrate` in a pre-deploy container. A failed migration
   stops the release.
4. Railway starts the service with `pnpm start`.
5. Railway checks `GET /health` for up to 300 seconds. This endpoint also runs a
   database query.
6. Railway routes traffic to the new deployment after the health check passes.

The previous successful deployment stays active when the build, migration, or
health check fails. Railway retries an application crash up to five times.

## Change Railway infrastructure

`.railway/railway.ts` at the repository root defines the Railway project. It
manages the API source, build and release commands, Postgres service, volume,
variables, replica placement, and custom domain.

Railway does not apply this file during an application build. Preview and apply
infrastructure changes from the repository root:

```bash
railway config plan
railway config apply
```

Review the plan before applying it. It should not delete the Postgres service,
volume, variables, or custom domain unless that deletion is intentional. Commit
and push the IaC change after the applied configuration is correct.

Do not add `railway.json` or `railway.toml`. Railway deprecated Config as Code;
this project uses the TypeScript IaC file instead.

## Environment variables

Railway holds the values for these API variables:

- `CRITERION_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `NODE_ENV`
- `POSTGRES_URL`

The IaC file preserves both secrets without writing their values to Git. It sets
`POSTGRES_URL` from the Railway Postgres service's `DATABASE_URL`.

Changing a service variable causes Railway to redeploy the API. Never commit a
secret value to this repository.

## Database data and embeddings

A normal deployment runs schema migrations only. It does not seed source data or
regenerate embeddings.

Run the data jobs from a linked checkout when needed:

```bash
pnpm --dir api-service railway:seed
pnpm --dir api-service railway:embed
```

The scripts open an SSH tunnel to Railway Postgres. `railway:embed` also requires
`GOOGLE_GENERATIVE_AI_API_KEY` on the API service.

## Verify a deployment

Check the public health endpoint:

```bash
curl --fail https://search.sunnah-stories.com/health
```

Check an authenticated route without putting the key in source:

```bash
curl --fail \
  --header "Authorization: Bearer $CRITERION_API_KEY" \
  "https://search.sunnah-stories.com/api/v1/quran/search?q=patience&limit=1"
```

Use Railway for deployment state and logs:

```bash
railway deployment list --service api --environment production --json
railway logs --service api --environment production --lines 200
```

Do not treat a queued, building, or deploying release as complete. A release is
live only after Railway reports `SUCCESS` and the production checks pass.

## Manual deployment

GitHub deployment is the normal path. For a deliberate one-off deployment of
the local checkout, run:

```bash
railway up ./api-service \
  --path-as-root \
  --service api \
  --environment production \
  --detach \
  -m "Describe the deployment"
```

This uploads local files, including uncommitted changes. Poll the resulting
deployment until it reaches a terminal state. A manual deployment does not
replace the GitHub source or the IaC workflow.
