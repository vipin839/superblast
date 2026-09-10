# Super BLAST — Claude AI Handoff & Developer Manual

**Target Audience**: Claude AI Assistant & Fullstack Bioinformatics Engineers  
**System Version**: 2.0.0 (Native BLAST+ & Next.js 16 App Router)  
**Project Path**: `F:\VS Code Folder\Super BLAST\SUPER_BLAST`  
**Live Production URL**: `https://www.superblast.app`  

---

## 1. Quick Reference & Cheat Sheet

| Parameter | Value |
| :--- | :--- |
| **Local Project Root** | `F:\VS Code Folder\Super BLAST\SUPER_BLAST` |
| **Offline Archive** | `F:\VS Code Folder\Super BLAST\Super_BLAST_Offline` |
| **Historical Doc** | `F:\VS Code Folder\Super BLAST.docx` |
| **GCP Project ID** | `super-blast-497610` |
| **Cloud Run Service** | `blasthub` (Regions: `us-central1`, `us-east4`) |
| **Direct Cloud Run URL** | `https://blasthub-523316980019.us-central1.run.app` |
| **Domain CDN** | Firebase Hosting → Cloud Run rewrite |
| **AI Model** | Google Gemini 2.5 Pro (`gemini-2.5-pro`) |
| **BLAST Engine** | Standalone NCBI BLAST+ 2.17.0 |

---

## 2. Core Architecture Rules for Claude

1. **Next.js 16 App Router Conventions**:
   * All interactive pages with React hooks (`useState`, `useEffect`, `useAuth`) MUST begin with `'use client';`.
   * Dynamic server routes must specify `export const dynamic = 'force-dynamic';` and `export const revalidate = 0;` to prevent stale caching.
2. **NCBI BLAST+ Native Execution**:
   * Always execute `blastn` using the native binary with `-outfmt 15` (JSON output format).
   * Do NOT use external public NCBI HTTP QBlast URLs for primary execution.
   * Always write temporary files to `/app/temp_queries` (production) or `os.tmpdir()` (local development).
3. **Dual Persistence Pattern**:
   * When saving jobs, ALWAYS write to browser `localStorage` first for instant UI transition, then asynchronously save to Firestore via `POST /api/jobs`.
4. **Preserve Comments & Code Style**:
   * Retain all existing bioinformatic docstrings, regex validations, and design variables in `globals.css`.

---

## 3. Local Development Commands

```powershell
# 1. Navigate to the project root
cd "F:\VS Code Folder\Super BLAST\SUPER_BLAST"

# 2. Install dependencies (Node 20+)
npm install

# 3. Start local development server
npm run dev
# App is available at http://localhost:3000

# 4. Build for production locally
npm run build

# 5. Run using Docker Compose (with local NCBI BLAST+ engine)
docker-compose up --build
# App is available at http://localhost:8080
```

---

## 4. Cloud Run & Firebase Deployment Instructions

```powershell
# 1. Authenticate with Google Cloud
gcloud auth login
gcloud config set project super-blast-497610

# 2. Build and Deploy Cloud Run Container
gcloud run deploy blasthub `
  --source . `
  --region us-central1 `
  --allow-unauthenticated `
  --memory 4Gi `
  --cpu 2 `
  --timeout 900 `
  --concurrency 80

# 3. Deploy Firebase Hosting CDN Proxy
firebase deploy --only hosting
```

---

## 5. Step-by-Step Recipes for Common Tasks

### Recipe A: Adding a New BLAST Reference Database
1. Open `src/lib/dbManager.js`.
2. Add your database key to `DATABASES` object with `filename`, `title`, `url`, `timeoutMs`.
3. If pre-baking into Docker, add the `wget` and `makeblastdb` commands into `Dockerfile` and `startup.sh`.
4. Add the option to the `<select>` dropdown in `src/app/search/page.js`.

### Recipe B: Modifying the Gemini AI Analysis Prompt
1. Open `src/app/api/blast/analyze/route.js`.
2. Update `SYSTEM_PROMPT` or the `buildAnalysisPrompt(data)` helper function.
3. If new metrics are needed, pass them from `triggerAiAnalysis()` in `src/app/search/[jobId]/page.js`.

### Recipe C: Updating PDF or Excel Export Formats
1. For PDF layouts: Edit `src/lib/exportPdf.js` (uses `jsPDF` and `autoTable`).
2. For Excel spreadsheets: Edit `src/lib/exportExcel.js` (uses `xlsx`).

---
*Manual verified for Claude AI assistant pairing.*
