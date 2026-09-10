# BLASTHub — deployment

Last verified 10 September 2026.

Project `super-blast-497610`, region `us-central1`, service `blasthub`,
domain `https://superblast.app`.

## The standing rule

Change offline → verify → deploy → re-validate on the live domain. Never
deploy something that has not built and passed tests locally.

```bash
npm run lint && npm test && npm run build
```

## Two images, two cadences

Application deploys used to take about five minutes because every build
re-downloaded BLAST+ and re-ran `makeblastdb` on every database. That work now
lives in a separate base image.

### 1. Base image — rarely

Rebuild only when the BLAST+ version or a database definition changes.

```bash
gcloud builds submit --config cloudbuild-base.yaml --project super-blast-497610 .
```

This builds `Dockerfile.base`, then runs the image and prints
`blastdbcmd -info` for every database. The build **fails** if any database
cannot be opened, so a broken index can never reach production.

After bumping the tag in `cloudbuild-base.yaml`, change `BASE_TAG` in
`Dockerfile` to match. That is the cache-invalidation control.

### 2. Application image — every code change

```bash
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/super-blast-497610/cloud-run-source-deploy/blasthub:latest \
  --project super-blast-497610 .
```

`FROM blasthub-base:<tag>` is pulled from Artifact Registry in the same
region, so no NCBI download and no indexing happens.

## Deploy

```bash
gcloud run deploy blasthub \
  --image us-central1-docker.pkg.dev/super-blast-497610/cloud-run-source-deploy/blasthub:latest \
  --region us-central1 --project super-blast-497610 \
  --allow-unauthenticated \
  --memory 4Gi --cpu 2 --no-cpu-throttling \
  --min-instances 1 --max-instances 10 --concurrency 80 \
  --timeout 300 --port 8080 --quiet
```

Do not set `--min-instances 0`. BLAST batches keep running after the HTTP
response returns; scale-to-zero would kill them mid-search.

## Required environment variables

Cloud Run currently has **no environment variables set**. At minimum the
results bucket must be configured, or every search will fail at the first
write with a clear error.

```bash
gcloud run services update blasthub \
  --region us-central1 --project super-blast-497610 \
  --update-env-vars BLAST_RESULTS_BUCKET=blasthub-results-super-blast-497610
```

Gemini interpretation, once you have a key from
<https://aistudio.google.com/apikey>:

```bash
# Store the key in Secret Manager — never as a plain env var, never in the image.
printf '%s' 'YOUR_KEY_HERE' | gcloud secrets create gemini-api-key \
  --data-file=- --project super-blast-497610

gcloud secrets add-iam-policy-binding gemini-api-key \
  --member serviceAccount:523316980019-compute@developer.gserviceaccount.com \
  --role roles/secretmanager.secretAccessor --project super-blast-497610

gcloud run services update blasthub --region us-central1 --project super-blast-497610 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

Diagnostics endpoint (optional; 404 while unset):

```bash
gcloud run services update blasthub --region us-central1 --project super-blast-497610 \
  --update-env-vars ADMIN_EMAILS=you@example.com
```

See [../.env.example](../.env.example) for the full classified list.

## Post-deploy validation

```bash
# 1. The new revision is serving all traffic
gcloud run services describe blasthub --region us-central1 --project super-blast-497610 \
  --format="value(status.traffic[0].revisionName,status.traffic[0].percent)"

# 2. Pages respond
for p in / /dashboard /search /history /settings; do
  printf '%-12s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://superblast.app$p)"
done

# 3. The API refuses anonymous callers (must be 401)
curl -s -o /dev/null -w 'jobs      -> %{http_code}\n' https://superblast.app/api/jobs
curl -s -o /dev/null -w 'status    -> %{http_code}\n' 'https://superblast.app/api/blast/status?rid=0123456789abcdef'
curl -s -o /dev/null -w 'submit    -> %{http_code}\n' -X POST https://superblast.app/api/blast/submit
curl -s -o /dev/null -w 'analyze   -> %{http_code}\n' -X POST https://superblast.app/api/blast/analyze
curl -s -o /dev/null -w 'test      -> %{http_code}\n' https://superblast.app/api/blast/test

# 4. Path traversal is rejected before any filesystem access (401 unauthenticated,
#    400 once authenticated — never 200 and never a file)
curl -s -o /dev/null -w 'traversal -> %{http_code}\n' \
  'https://superblast.app/api/blast/results?rid=../../etc/passwd'
```

Then sign in and click through: dashboard, new search, upload, submit,
results, alignment drawer, AI panel, exports, history, settings, sign out.

## Rollback

```bash
gcloud run services update-traffic blasthub \
  --region us-central1 --project super-blast-497610 \
  --to-revisions <previous-revision>=100
```

List revisions with:

```bash
gcloud run revisions list --service blasthub --region us-central1 --project super-blast-497610
```

## Logs

```bash
gcloud run services logs read blasthub --region us-central1 \
  --project super-blast-497610 --limit 100
```
