# BLASTHub — developer and deployment guide

Reference for any Claude session working on this codebase.
**Last verified against the code on 10 September 2026.** If something here
disagrees with the code, the code is right — fix this file.

---

## 1. What this is

BLASTHub (<https://superblast.app>) runs bulk nucleotide BLAST searches
against pre-indexed reference databases on managed infrastructure, and
interprets the results.

| Layer | Actual implementation |
|---|---|
| Framework | Next.js 16.3.x, App Router, `output: 'standalone'`, Turbopack |
| React | 19.2.4 |
| Styling | CSS custom-property design system in `src/app/globals.css`; three-state theme (system/light/dark) |
| BLAST engine | NCBI BLAST+ 2.17.0 native binaries; `blastn` with `megablast`, `dc-megablast`, `blastn` tasks; `-outfmt 15` |
| AI | Google Gemini via REST (`generativelanguage.googleapis.com`). Model is a candidate list in `GEMINI_MODEL`, first that answers wins; the response reports which one ran. **No `@google/genai` package is used.** |
| Auth | Firebase Auth (Google sign-in); server verifies ID tokens with Firebase Admin |
| Metadata | Cloud Firestore via Admin SDK |
| Result payloads | Cloud Storage (`BLAST_RESULTS_BUCKET`) |
| Host | Cloud Run service `blasthub`, us-central1, 4 GiB / 2 vCPU |
| Domain | Firebase Hosting rewrites `superblast.app` to the Cloud Run service |

`www.superblast.app` is a 301 redirect to the apex, registered in Firebase
Hosting with an A record at `199.36.158.100`. Certificate provisioning may
still be in progress — see section 6.

---

## 2. Infrastructure

- GCP / Firebase project: `super-blast-497610`
- Region: `us-central1`
- Cloud Run service: `blasthub`
- Image: `us-central1-docker.pkg.dev/super-blast-497610/cloud-run-source-deploy/blasthub:latest`
- Base image: `.../blasthub-base:blast2.17.0-db3` (BLAST+ 2.17.0, five databases, NCBI taxdb)
- Repository: `https://github.com/vipin839/superblast`
- Results bucket: `blasthub-results-super-blast-497610`
- Runtime service account: `523316980019-compute@developer.gserviceaccount.com`
- Direct URL: `https://blasthub-523316980019.us-central1.run.app`

Credentials are **not** recorded in this file. Use `gcloud auth` and Secret
Manager. Any key that has been pasted into a chat transcript should be
rotated.

---

## 3. Layout

```
SUPER_BLAST/
├── Dockerfile              app image; FROM blasthub-base
├── Dockerfile.base         BLAST+ 2.17.0 + reference databases
├── cloudbuild-base.yaml    builds AND validates the base image
├── scripts/build-blastdb.sh
├── docs/ARCHITECTURE.md    request path, auth model, known limits
├── docs/DATABASES.md       provenance, rebuild, validation, troubleshooting
├── docs/DEPLOYMENT.md      build, deploy, env vars, rollback
├── tests/                  vitest suites
└── src/
    ├── app/
    │   ├── layout.js                 root layout — keep force-dynamic
    │   ├── page.js                   landing / sign-in
    │   ├── globals.css               design system
    │   ├── dashboard/ search/ history/ settings/
    │   └── api/
    │       ├── blast/{submit,status,results,cancel,analyze,test}/route.js
    │       ├── databases/route.js    live database availability
    │       └── jobs/{route.js,[jobId]/route.js}
    ├── components/{AppShell,ThemeSync}.js, components/ui/
    ├── hooks/useAuth.js
    └── lib/
        ├── apiAuth.js       requireAuth, assertOwner, rate limits, rid allowlist
        ├── apiClient.js     browser-side authenticated fetch
        ├── ids.js           job id and rid generation + validation
        ├── nativeBlast.js   spawn blastn, process registry, JSON-15 parser
        ├── dbManager.js     database registry and readiness state machine
        ├── resultStore.js   Cloud Storage result persistence
        ├── firestoreJobs.js, firebaseAdmin.js, firebase.js
        ├── format.js        THE identity brackets and E-value formatting
        └── exportExcel.js (exceljs), exportPdf.js (jspdf)
```

Function names, for searching: `submitNativeBlast`, `parseBlastJSON`,
`countGapOpens`, `cancelBlast`, `checkDatabaseStatus`, `inspectDatabase`,
`listDatabases`, `requireAuth`, `assertOwner`, `assertRid`, `parseRids`,
`putResult`, `getResult`, `statusOf`.

(There is no `runNativeBlast`, no `parseBlastJson15`, and no
`checkDatabaseReady`. Older docs referred to those; they never existed.)

---

## 4. Rules that must not be broken

### A. Never trust client-supplied identity
Every `/api/*` route calls `requireAuth(request)` and derives the uid from the
verified token. No route may read `uid` from a query string or body. Job
access goes through `assertOwner(job, uid)`, which returns 404 (not 403) for
another user's job so IDs cannot be enumerated.

### B. Never build a filesystem path from an unvalidated identifier
RIDs go through `assertRid()` / `parseRids()` first. The allowlist
(`/^[a-f0-9]{16}$/`) and the generator live together in `src/lib/ids.js`.

### C. Never claim something the system did not do
No fake "terminated" for a process still running, no "Ready" badge for a
database that cannot run, and never a model name on a summary that model did
not produce. When a capability is unavailable, the response carries a `reason`
and the UI shows it.

### D. Cache invalidation on the live domain
`src/app/layout.js` must keep:
```js
export const dynamic = 'force-dynamic';
export const revalidate = 0;
```
and `firebase.json` must keep the `Cache-Control: no-cache, no-store, …`
header for `**`. Without both, the domain serves stale HTML.

### E. Deploy discipline (the user's standing rule)
Edit offline → verify → deploy → re-validate on the live domain.
Update `DEPLOY_TIME` in `src/app/page.js` before every deploy.

### F. min-instances must stay at 1
BLAST batches continue after the HTTP response returns. Scale-to-zero kills
them mid-search.

---

## 5. Commands

```bash
npm run dev        # port 3000
npm run lint       # must be 0 errors
npm test           # vitest
npm run build      # must succeed before any deploy
```

Deployment, environment variables and rollback: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
Database provenance and rebuild: [docs/DATABASES.md](docs/DATABASES.md).

---

## 6. Open items

Last reviewed 10 September 2026.

| Item | State |
|---|---|
| `www.superblast.app` | A record live, Firebase reports `DNS_MATCH`, 301 redirect to apex configured. Certificate provisioning. |
| Gemini | Working via `GEMINI_MODEL=gemini-3.5-flash,gemini-flash-latest`. **`gemini-2.5-pro` is retired for new accounts** and Pro-tier has zero free-tier quota — enable billing on the AI Studio project to use Pro, then prepend it to `GEMINI_MODEL`. |
| Runtime identity | us-central1 runs as `blasthub-runtime@` (Firestore, one bucket, one secret, logs). **us-east4 still uses the default compute SA with `roles/editor`.** |
| Firestore | Point-in-time recovery **enabled** (7 days) and delete protection **enabled**. |
| Monitoring | Uptime check every 5 min from 3 regions; alerts for site-down and 5xx rate, emailing sainivipin839@gmail.com. |
| Second copy of the app | `blasthub` in us-east4 is patched and `robots.txt` blocks indexing. Delete once Google de-indexes it. |
| Repository | `github.com/vipin839/superblast` — currently **public**. No secrets tracked. |
| Human GRCh38 database | Deliberately disabled; needs persistent disk and a pre-built index. |
| Cross-instance cancellation | Best-effort by design; see docs/ARCHITECTURE.md. |
| Rate limits | Per-instance, in memory. A cost guard, not a security boundary. |
| npm advisories | 7 moderate, all transitive inside `firebase-admin`'s bundled storage client. |
| Results retention | No lifecycle rule on the results bucket; objects accumulate indefinitely. |

## 7. How to work on this

1. Read the actual file before editing it.
2. Match the surrounding style; the codebase uses plain JS, no TypeScript.
3. Run lint, tests and build locally before deploying.
4. After deploying, verify on `https://superblast.app` — not on the
   `run.app` URL, which bypasses Firebase Hosting.
5. If you change behaviour, update the doc that describes it in the same pass.
