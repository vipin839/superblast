# Super BLAST — Complete Forensic Architecture & Technical Documentation

**Document Version**: 2.0.0  
**Audit Date**: August 2026  
**System Status**: Production Live (`https://superblast.app`)  
**Project Path**: `F:\VS Code Folder\Super BLAST\SUPER_BLAST`  
**Historical Spec Source**: `F:\VS Code Folder\Super BLAST.docx`  

---

## 1. Executive Summary & Project Identification

**Super BLAST** (also identified across the codebase and user interface as **BLASTHub v2.0**) is an enterprise-grade, cloud-native bioinformatics software platform designed to execute high-throughput nucleotide sequence alignment searches (NCBI BLAST+ `blastn`) in bulk. The system visualizes pairwise alignments, maintains search history, exports reports (PDF, Excel, JSON, CSV), and delivers AI-powered biological interpretation using Google Gemini 2.5 Pro.

### Key Identifiers & Locations
* **Local Project Root**: `F:\VS Code Folder\Super BLAST\SUPER_BLAST`
* **Historical Documentation**: `F:\VS Code Folder\Super BLAST.docx` (6,276 characters, 215 paragraphs analyzed)
* **Historical Prototype / Backup**: `F:\VS Code Folder\Super BLAST\old_version_backup`
* **Claude / AI Operating Manual**: `F:\VS Code Folder\Super BLAST\SUPER_BLAST\CLAUDE.md`
* **Master Architecture Guide**: `F:\VS Code Folder\Super BLAST\SUPER_BLAST\SUPER_BLAST_COMPLETE_DOCUMENTATION.md`
* **Offline Project Archive**: `F:\VS Code Folder\Super BLAST\Super_BLAST_Offline`
* **Live Custom Domain**: `https://www.superblast.app` / `https://superblast.app`
* **Live Cloud Run Direct URL**: `https://blasthub-523316980019.us-central1.run.app`
* **GCP Project ID**: `super-blast-497610` (Project Number: `523316980019`)

---

## 2. Architecture Evolution: AWS Blueprint vs. GCP Production

A forensic audit of the historical document (`Super BLAST.docx`) reveals that Super BLAST underwent an architectural pivot from a multi-service AWS design to a unified Google Cloud Platform (GCP) containerized Next.js application.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           HISTORICAL BLUEPRINT (AWS)                            │
│                                                                                 │
│  [ React Vite SPA ] ──► [ AWS API Gateway ] ──► [ FastAPI Lambda / App Runner ] │
│                                                          │                      │
│                                                          ▼                      │
│                                              [ AWS Batch / ElasticBLAST ]       │
│                                                          │                      │
│                                      ┌───────────────────┴───────────────────┐  │
│                                      ▼                                       ▼  │
│                               [ DynamoDB Jobs ]                        [ S3 Results ]│
└─────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ ARCHITECTURAL PIVOT
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      CURRENT PRODUCTION ARCHITECTURE (GCP)                      │
│                                                                                 │
│   [ Client Browser ] ──► [ Firebase Hosting CDN Proxy (superblast.app) ]        │
│                                      │ (Cache-Control: max-age=0)               │
│                                      ▼                                          │
│   [ Cloud Run: blasthub (Next.js 16 App Router on Node 20-slim + BLAST+ 2.17) ] │
│     ├── Frontend: React 19 Client Components, Glassmorphism CSS, AuthContext   │
│     ├── API Routes: /api/blast/submit, /api/blast/status, /api/blast/results    │
│     ├── Native Engine: nativeBlast.js (Child Process spawn `blastn -outfmt 15`) │
│     ├── Local BLAST DBs: Drosophila (30MB), E. coli (5MB), Viruses (1MB), Human │
│     ├── AI Service: Gemini 2.5 Pro (/api/blast/analyze)                         │
│     └── Storage/DB: Google Cloud Firestore (`super-blast-497610`)               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Architectural Comparison Matrix

| Component | Historical Blueprint (from `Super BLAST.docx`) | Current Production Implementation |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18 with Vite SPA | Next.js 16.1.6 App Router with React 19 |
| **Styling & Theme** | Tailwind CSS / Lucide icons | Custom Dark-Theme Glassmorphism CSS (`globals.css`) |
| **Backend Runtime** | Python 3.11 / FastAPI | Node.js 20-slim / Next.js Server Route Handlers |
| **BLAST Execution Engine** | AWS Batch / ElasticBLAST distributed cluster | Native standalone NCBI BLAST+ 2.17.0 inside Cloud Run container |
| **Job & Metadata Database** | Amazon DynamoDB (`superblast_jobs` table) | Google Cloud Firestore (`jobs` and `users/{uid}/jobs`) |
| **Result File Storage** | Amazon S3 bucket (`superblast-results-*`) | Local container `/app/temp_queries` + Firestore metadata |
| **AI Interpretation** | LLM analysis via OpenAI / Anthropic API | Google Gemini 2.5 Pro via REST API (`/api/blast/analyze`) |
| **Authentication** | Firebase Auth / AWS Cognito | Firebase Authentication (Google OAuth Provider) |
| **Hosting & DNS** | AWS CloudFront + S3 static website | Firebase Hosting CDN with rewrite to Cloud Run (`superblast.app`) |
| **Export Engine** | Client-side CSV/JSON generator | Client-side `jspdf`, `jspdf-autotable`, `xlsx`, `file-saver` |

---

## 3. Historical Requirements Analysis (`Super BLAST.docx`)

The historical requirements document (`Super BLAST.docx`) contains 215 paragraphs specifying the initial requirements, system architecture, component responsibilities, data flow, API signatures, error handling, security considerations, and deployment patterns.

### Forensic Breakdown of Historical Modules:
1. **Module 1: User Experience & Bulk Upload**:
   - Researchers must be able to upload multiple FASTA files (up to 100 files simultaneously) without manual sequence-by-sequence pasting.
   - Client-side validation must check headers (`>header`) and valid nucleotide alphabets (`ATCGN...`) before sending network payloads.
2. **Module 2: Search Configuration**:
   - Support for `blastn` program with selectable tasks: `megablast` (highly similar), `dc-megablast` (more dissimilar), and standard `blastn` (somewhat similar).
   - Configurable E-value threshold (e.g., 0.01) and maximum target sequences (up to 500).
3. **Module 3: Asynchronous Job Execution & Polling**:
   - Long-running BLAST jobs must execute asynchronously in the background.
   - The client polls job status using a unique Request ID (RID) until completion (`READY`), error (`FAILED`), or user cancellation (`TERMINATED`).
4. **Module 4: Alignment Visualization & Biological Parsing**:
   - Pairwise sequence alignments must be parsed from machine-readable outputs and presented with color-coded matches, mismatches, and gaps.
   - Subject accession IDs must be linked directly to NCBI Nucleotide (`https://www.ncbi.nlm.nih.gov/nuccore/<accession>`).
5. **Module 5: Per-Query Summary & Taxonomic Grouping**:
   - Multi-query results must be aggregated by individual query sequence, displaying top matches, identity percentages, and species distributions.
6. **Module 6: AI-Powered Scientific Insights**:
   - Results should be synthesized into executive biological summaries, taxonomic breadth assessments, sequence identity evaluations ($\ge 97\%$, $90-97\%$, $80-90\%$, $<80\%$), functional inferences, and follow-up recommendations.
7. **Module 7: Comprehensive Multi-Format Export**:
   - Provide multi-worksheet Excel reports (`.xlsx`), publication-ready PDF reports (`.pdf`), raw JSON data (`.json`), and comma-separated tabular files (`.csv`).
8. **Module 8: History & Dashboard Management**:
   - Users must have a centralized dashboard to track all past searches, view execution metadata, reload results, and delete obsolete jobs.
9. **Module 9: Resilience & Ephemeral Resource Maintenance**:
   - Temporary query files must be automatically purged after execution to avoid disk exhaustion.
   - Network dropouts should fall back to local client caching (`localStorage`).
10. **Module 10: Cloud Deployment & CDN Integration**:
    - High-concurrency container hosting with custom domain routing and strict cache invalidation for dynamic search result pages.

---

## 4. Requirement Traceability Matrix

| Req # | Historical Requirement Description | Implementation File(s) | Status | Verification Notes |
| :--- | :--- | :--- | :--- | :--- |
| **REQ-01** | Support bulk upload of up to 100 FASTA files | `src/app/search/page.js` | **Fully Implemented** | `MAX_FILES = 100`, validates extensions (`.fasta`, `.fa`, `.fna`, `.faa`, `.fas`, `.fsa`, `.txt`) and 10MB individual limits. |
| **REQ-02** | Client-side nucleotide FASTA format validation | `src/app/search/page.js` | **Fully Implemented** | `validateFastaContent()` regex checks for header `>` and nucleotide alphabet `[ATCGNRYSWKMBDHV]`. |
| **REQ-03** | Local Native NCBI BLAST+ execution | `src/lib/nativeBlast.js`, `Dockerfile` | **Fully Implemented** | NCBI BLAST+ 2.17.0 compiled in container; executes `blastn` with `-outfmt 15` (JSON). |
| **REQ-04** | Support multiple reference databases | `src/lib/dbManager.js`, `Dockerfile` | **Fully Implemented** | Pre-indexed: Drosophila RNA (30MB), E. coli (5MB), Viruses (1MB). Lazy-loaded: Human GRCh38 (3.2GB). |
| **REQ-05** | BLAST parameter customisation | `src/app/search/page.js`, `src/lib/nativeBlast.js` | **Fully Implemented** | Configurable E-value, Max Target Sequences (1-500), and Task (`megablast`, `dc-megablast`, `blastn`). |
| **REQ-06** | Concurrency control & queue management | `src/app/api/blast/submit/route.js` | **Fully Implemented** | `CONCURRENCY_LIMIT = 4` using chunked `Promise.all` batches. |
| **REQ-07** | Job status tracking & background execution | `src/app/api/blast/status/route.js`, `page.js` | **Fully Implemented** | Frontend polls every 15s (`POLL_INTERVAL = 15000`); backend writes `final_<rid>.json` or `error_<rid>.json`. |
| **REQ-08** | Persistent job storage & history | `src/lib/firestoreJobs.js`, `src/app/api/jobs/route.js` | **Fully Implemented** | Dual persistence: Firestore (`jobs/{id}` and `users/{uid}/jobs/{id}`) with fallback to browser `localStorage`. |
| **REQ-09** | User authentication | `src/hooks/useAuth.js`, `src/lib/firebase.js` | **Fully Implemented** | Firebase Auth with Google OAuth popup. |
| **REQ-10** | Interactive alignment visualizer | `src/app/search/[jobId]/page.js` | **Fully Implemented** | `renderAlignment()` chunks 60bp blocks with colorized matches (`|`), mismatches, and gaps. |
| **REQ-11** | Per-Query Summary & multi-hit breakdown | `src/app/search/[jobId]/page.js` | **Fully Implemented** | Displays query length, top identity %, best accession link to NCBI, and taxonomic breakdown. |
| **REQ-12** | Gemini 2.5 Pro biological interpretation | `src/app/api/blast/analyze/route.js` | **Fully Implemented** | Structured prompt covering Summary, Taxonomy, Identity, Function, Quality, Recommendations; with local fallback. |
| **REQ-13** | Publication-quality PDF export | `src/lib/exportPdf.js` | **Fully Implemented** | `jsPDF` landscape A4 with summary, hit table, Gemini analysis section, and per-query pages. |
| **REQ-14** | Multi-sheet Excel workbook export | `src/lib/exportExcel.js` | **Fully Implemented** | `xlsx` generating Sheet 1 (Summary), Sheet 2 (All Hits), and Sheet 3+ (Per-Query details). |
| **REQ-15** | Machine-readable JSON/CSV downloads | `src/app/search/[jobId]/page.js` | **Fully Implemented** | Direct client blob downloads for raw JSON results and CSV tabular rows. |
| **REQ-16** | Search results sorting and filtering | `src/app/search/[jobId]/page.js` | **Fully Implemented** | Filter by query, accession, species, title; sort asc/desc across all metric columns. |
| **REQ-17** | Ephemeral file cleanup | `src/lib/cleanupTemp.js` | **Fully Implemented** | Automated background sweep deleting temp files older than 1 hour; executes every 15 minutes. |
| **REQ-18** | Job termination capability | `src/app/search/[jobId]/page.js` | **Fully Implemented** | Terminate button stops polling and updates status to `terminated` in Firestore. |
| **REQ-19** | Custom domain routing & CDN bypass | `firebase.json`, `src/app/layout.js` | **Fully Implemented** | `force-dynamic`, `revalidate = 0`, and `Cache-Control: no-store, max-age=0` in CDN headers. |
| **REQ-20** | Offline execution readiness | `docker-compose.yml`, `startup.sh` | **Fully Implemented** | Dockerized runtime allows full standalone local deployment with embedded databases. |

---

## 5. Complete Source Code & Project Inventory

```
F:\VS Code Folder\Super BLAST\
├── Super BLAST.docx                         # Historical specification document (6,276 chars, 215 paragraphs)
├── old_version_backup\                      # Historical prototype (FastAPI backend + Vite React frontend)
├── Super_BLAST_Offline\                     # Complete standalone offline project distribution
└── SUPER_BLAST\                             # Active Production Fullstack Next.js Repository
    ├── .env.local                           # Environment variables (GEMINI_API_KEY, Firebase credentials)
    ├── .firebaserc                          # Firebase project target (`super-blast-497610`)
    ├── .gitignore                           # Git ignore definitions
    ├── AGENTS.md                            # Next.js agent conventions notice
    ├── CLAUDE.md                            # Comprehensive Claude AI developer & deployment guide
    ├── SUPER_BLAST_COMPLETE_DOCUMENTATION.md# This comprehensive forensic document
    ├── SUPER_BLAST_CLAUDE_HANDOFF.md        # AI handoff and maintenance guide
    ├── SUPER_BLAST_AI_CONTEXT.md           # LLM system context & prompt memory
    ├── Dockerfile                           # Multi-stage production container build (Node 20 + BLAST+ 2.17)
    ├── docker-compose.yml                   # Local container orchestration file
    ├── firebase.json                        # Firebase Hosting CDN rewrites and Cache-Control headers
    ├── next.config.mjs                      # Next.js build and runtime configuration
    ├── package.json                         # Node.js project manifest and dependency definitions
    ├── package-lock.json                    # Deterministic dependency lockfile
    ├── README.md                            # Standard Next.js quickstart readme
    ├── startup.sh                           # VM initialization and database bootstrap shell script
    ├── test_api.js                          # Node.js API endpoint verification script
    ├── test_ncbi.cjs                        # NCBI API test script (CommonJS)
    ├── test_ncbi.mjs                        # NCBI API test script (ESM)
    ├── test_sequences.fasta                 # Sample multi-FASTA test query file
    ├── test_staph.fasta                     # Sample single FASTA test query file
    ├── public\                              # Static assets
    └── src\                                 # Application Source Code
        ├── app\                             # Next.js App Router
        │   ├── globals.css                  # Master Design System (1,334 lines, dark glassmorphism)
        │   ├── layout.js                    # Root Layout (AuthProvider, Navbar, Footer, Dynamic config)
        │   ├── page.js                      # Landing / Hero Page (DNA background, Google Auth CTA)
        │   ├── dashboard\
        │   │   └── page.js                  # User Dashboard (Job statistics, history cards, delete action)
        │   ├── search\
        │   │   ├── page.js                  # Search Input Page (Upload dropzone, FASTA validation, parameters)
        │   │   └── [jobId]\
        │   │       └── page.js              # Results Page (Polling, Visual Alignments, Gemini AI, Exports)
        │   └── api\                         # Backend API Route Handlers
        │       ├── blast\
        │       │   ├── submit\route.js      # Job submission, sequence batching, concurrency limiter
        │       │   ├── status\route.js      # Job polling endpoint (READY, PROCESSING, FAILED)
        │       │   ├── results\route.js     # Result retrieval endpoint (reads parsed JSON)
        │       │   ├── analyze\route.js     # Gemini 2.5 Pro AI analysis & local fallback generator
        │       │   └── test\route.js        # Health check & BLAST+ binary diagnostic endpoint
        │       └── jobs\
        │           ├── route.js             # User job listing & creation (Firestore GET / POST)
        │           └── [jobId]\route.js     # Specific job fetch, update, delete (GET / PATCH / DELETE)
        ├── components\                      # React Reusable Components
        │   ├── Navbar.js                    # Top navigation bar (Logo, links, user avatar, sign out)
        │   └── Footer.js                    # Application footer (Version badge, deployment timestamp)
        ├── hooks\                           # React Custom Hooks
        │   └── useAuth.js                   # Firebase Auth context, Google Sign-in popup, session state
        └── lib\                             # Core Business Logic & Engine Utilities
            ├── cleanupTemp.js               # Ephemeral temp file background sweeper (1h TTL, 15m interval)
            ├── dbManager.js                 # BLAST database catalog, download manager, makeblastdb indexer
            ├── exportExcel.js               # Multi-sheet Excel generator (Summary, All Hits, Per-Query)
            ├── exportPdf.js                 # Landscape PDF report generator (jsPDF autotable)
            ├── firebase.js                  # Client-side Firebase SDK initialization (Auth, Firestore)
            ├── firebaseAdmin.js             # Server-side Firebase Admin SDK initialization (Cloud Run IAM)
            ├── firestoreJobs.js             # Firestore CRUD abstraction (`jobs`, `users/{uid}/jobs`)
            ├── nativeBlast.js               # Child process BLAST+ executor & JSON 15 output parser
            └── ncbiBlast.js                 # Formatting utilities (E-value formatter, identity color classes)
```

---

## 6. Frontend Architecture Deep-Dive

### 6.1 State Management & Component Architecture
* **Framework**: Next.js 16.1.6 App Router with React 19 Client Components (`'use client'`).
* **Authentication Provider (`src/hooks/useAuth.js`)**: Wraps the entire application in `RootLayout` (`src/app/layout.js`). Observes Firebase Auth state changes using `onAuthStateChanged`. Exposes `{ user, loading, signInWithGoogle, signOut }`.
* **Instant UI Navigation & Dual-Cache Pattern**:
  When submitting a search in `src/app/search/page.js`:
  1. The job object is instantly serialized to `localStorage` under `blasthub-job-<jobId>` and added to `blasthub-jobs`.
  2. The page triggers an immediate client transition to `/search/<jobId>` without waiting for cloud database roundtrips.
  3. The `/search/<jobId>` results page initializes state from `localStorage` within 0ms, while simultaneously dispatching an asynchronous background fetch to `/api/jobs/<jobId>` to sync cloud state.

### 6.2 Visual Presentation & Design System (`src/app/globals.css`)
The UI is styled using a custom, high-density dark-mode design system with glassmorphic cards and bio-themed visual cues.

```css
:root {
  --bg-primary: #0a0e1a;
  --bg-secondary: #111827;
  --bg-tertiary: #1a1f35;
  --bg-card: rgba(17, 24, 39, 0.7);
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --accent-blue: #00d4ff;
  --accent-violet: #7c3aed;
  --accent-pink: #e94560;
  --accent-green: #10b981;
  --accent-amber: #f59e0b;
}
```

### 6.3 Sequence Alignment Visualizer (`src/app/search/[jobId]/page.js`)
* Renders 60bp chunked blocks for both Query and Subject sequences.
* Computes precise base numbering offset for both Query (`qStart + i`) and Subject (`sStart + i`).
* Compares query sequence, subject sequence, and midline match string:
  * Exact match (`|`): Colored glowing green (`var(--accent-green)`).
  * Mismatch: Colored warning pink (`var(--accent-pink)`).
  * Gap (`-`): Dimmed placeholder (`var(--text-muted)`).

---

## 7. Backend API & Engine Layer Architecture

### 7.1 REST API Endpoint Specifications

#### 1. `POST /api/blast/submit`
* **Purpose**: Ingests uploaded FASTA sequences, validates format, writes temporary disk files, and spawns parallel native BLAST+ worker threads.
* **Request Payload**:
  ```json
  {
    "sequences": [
      { "filename": "sample1.fasta", "content": ">seq1\nATGCGATCG..." }
    ],
    "config": {
      "program": "blastn",
      "database": "drosophila",
      "evalue": "0.01",
      "maxTargetSeqs": "50",
      "task": "megablast"
    }
  }
  ```
* **Response Payload (200 OK)**:
  ```json
  {
    "success": true,
    "jobs": [
      { "rid": "a1b2c3d4e5f67890", "filename": "sample1.fasta", "count": 1 }
    ],
    "errors": [],
    "totalBatches": 1
  }
  ```

#### 2. `GET /api/blast/status?rid=<RID>`
* **Purpose**: Checks the background execution status of a specific batch RID.
* **Response (Ready)**: `{"status": "READY", "message": "Local BLAST search completed.", "hasHits": true}`
* **Response (Processing)**: `{"status": "PROCESSING", "message": "Job is currently running in the background."}`
* **Response (Failed)**: `{"status": "FAILED", "message": "Error details..."}`

#### 3. `GET /api/blast/results?rid=<RID>`
* **Purpose**: Fetches the structured JSON output generated by the native BLAST+ engine from `/app/temp_queries/final_<rid>.json`.
* **Response**: Returns normalized array of hits with alignments, accessions, E-values, bit scores, identities, and species taxonomy.

#### 4. `POST /api/blast/analyze`
* **Purpose**: Sends parsed hit statistics to Google Gemini 2.5 Pro for biological interpretation.
* **Response**:
  ```json
  {
    "analysis": "## Summary\n...",
    "source": "gemini-2.5-pro"
  }
  ```

#### 5. `GET / POST /api/jobs` and `GET / PATCH / DELETE /api/jobs/[jobId]`
* **Purpose**: CRUD interface for Firestore search history persistence and retrieval.

---

## 8. Super BLAST Engine Execution Deep-Dive (`src/lib/nativeBlast.js`)

The native engine manages the safe execution of standalone NCBI BLAST+ CLI binaries inside the container.

```
[ Incoming Query FASTA ]
          │
          ▼
[ Sanitize & Write to /app/temp_queries/query_<rid>.fasta ]
          │
          ▼
[ Check / Auto-Index Database via dbManager.js ]
          │
          ▼
[ Spawn Child Process: blastn -query ... -db ... -out ... -outfmt 15 ]
          │
          ├──► Timeout Monitor (Drosophila: 120s, Human: 600s)
          │
          ▼
[ Read Raw NCBI JSON-15 Output ]
          │
          ▼
[ parseBlastJson15(): Normalize Hits, Alignments, Midlines, Taxonomy ]
          │
          ▼
[ Atomic Write: final_<rid>.json ] ──► [ Status Endpoint reports READY ]
          │
          ▼
[ Cleanup: Remove query_<rid>.fasta & out_<rid>.json ]
```

### Command Execution Template
```bash
blastn \
  -task megablast \
  -query /app/temp_queries/query_<rid>.fasta \
  -db /app/blastdb/drosophila \
  -out /app/temp_queries/out_<rid>.json \
  -outfmt 15 \
  -evalue 0.01 \
  -max_target_seqs 50 \
  -num_threads 2
```

### Parameter Validation & Security Sanitization
To prevent command injection and unauthorized file access, parameters are strictly sanitized:
* `safeProgram`: Constrained to `'blastn'` (whitelisted).
* `safeTask`: Constrained to `'megablast'`, `'dc-megablast'`, or `'blastn'`.
* `safeEvalue`: Regex validated `^[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$`. Defaults to `'0.01'`.
* `safeMaxTargets`: Integer parsed and clamped between `1` and `500`.

---

## 9. BLAST Database Management (`src/lib/dbManager.js`)

Super BLAST supports 4 reference databases divided into pre-indexed and lazy-loaded categories:

| Key | Database Name | Source | Size | Provisioning Mode | Search Timeout |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `drosophila` | *Drosophila melanogaster* RNA | NCBI RefSeq cDNA | ~30 MB | **Pre-indexed in Docker image** | 120 sec |
| `ecoli` | *Escherichia coli* K-12 str. MG1655 | NCBI RefSeq complete genome | ~5 MB | **Pre-indexed in Docker image** | 120 sec |
| `viruses` | Major Viruses (SARS-CoV-2, HIV-1, Influenza) | NCBI GenBank reference genomes | ~1 MB | **Pre-indexed in Docker image** | 60 sec |
| `human` | Human Genome GRCh38.p14 (Chr 21/22/M) | NCBI RefSeq chromosome fasta | ~3.2 GB | **On-demand download & index on 1st query** | 600 sec |

### Database File Registry Structure
When indexed with `makeblastdb -in <file.fna> -dbtype nucl -out <dbname> -title <title>`, the following binary index files are produced inside `/app/blastdb`:
* `<dbname>.nhr` — Header index
* `<dbname>.nin` — Sequence index
* `<dbname>.nog` / `<dbname>.nnd` — Sequence offsets and taxonomy links
* `<dbname>.nsq` — Raw nucleotide sequence binary data

---

## 10. Database & State Persistence (Firestore & LocalStorage)

Super BLAST employs a multi-tiered resilience strategy for state persistence:

1. **Top-Level Firestore Collection (`jobs/{jobId}`)**:
   * Direct document lookup by ID.
   * Enables zero-latency sharing of result links across collaborators (`/search/<jobId>`).
2. **User Subcollection (`users/{uid}/jobs/{jobId}`)**:
   * Scoped to individual authenticated users.
   * Enables user dashboard queries without requiring composite collection group indexes.
3. **Browser LocalStorage Cache (`blasthub-job-<jobId>`)**:
   * Provides immediate offline-first navigation.
   * Ensures searches are never lost even if network connectivity drops during job submission.

---

## 11. AI Biological Analysis Subsystem (`src/app/api/blast/analyze/route.js`)

When a search completes, the user can request biological interpretation powered by Google Gemini 2.5 Pro.

### Prompt Engineering Architecture
The backend aggregates the search results and feeds a structured prompt to Gemini with the following specialized sections:
1. **Summary**: Concise high-level biological synopsis of findings.
2. **Taxonomic Distribution**: Dominant taxa, relative abundances, and phylogenetic relationships.
3. **Sequence Identity Analysis**:
   * $\ge 97\%$: Species-level identification (orthologs vs. paralogs).
   * $90-97\%$: Genus-level matches.
   * $80-90\%$: Family-level matches.
   * $< 80\%$: Distant homology or novel divergent sequences.
4. **Functional Implications**: Gene functions, biological pathways, and strand orientations.
5. **Quality Assessment**: Statistical significance of E-values ($E < 10^{-5}$), alignment lengths, and potential chimeric artifacts.
6. **Recommendations**: 3 to 5 actionable next steps (phylogenetics, protein structure prediction, additional database searches).

### Deterministic Local Fallback Engine
If no `GEMINI_API_KEY` is configured or if the Gemini API rate limit is exceeded, `generateFallbackAnalysis()` deterministically computes taxonomic frequencies, classifies identity brackets, checks E-value distributions, and generates Markdown-formatted interpretation without external network calls.

---

## 12. Export & Reporting Subsystem

### 1. PDF Generation (`src/lib/exportPdf.js`)
* Uses `jsPDF` (landscape A4) with `jspdf-autotable`.
* Generates dark-accented executive summaries, tabular alignment metrics, the full Gemini AI biological interpretation, and dedicated per-query detail pages.

### 2. Multi-Sheet Excel Workbook (`src/lib/exportExcel.js`)
* Uses `xlsx` and `file-saver`.
* **Sheet 1 ("Summary")**: Program parameters, timestamps, total hits, average identity, and species frequency table.
* **Sheet 2 ("All Hits")**: Complete tabular data with 22 biological and mathematical columns.
* **Sheet 3+ ("Query 1", "Query 2", ...)**: Dedicated worksheets for each individual FASTA query sequence in the batch.

### 3. Machine-Readable Downloads
* **JSON**: Complete raw output preserving alignment coordinates, subject accession numbers, and configuration metadata.
* **CSV**: Standard comma-delimited tabular rows formatted for spreadsheet import or R/Python data pipeline ingestion.

---

## 13. Containerization, Runtime & Deployment Pipeline

### 13.1 Dockerfile Specification (`Dockerfile`)
* **Base Image**: `node:20-slim` (Debian-based).
* **System Packages**: `ncbi-blast+` (v2.17.0), `wget`, `tar`, `curl`, `ca-certificates`.
* **Application User**: Non-root `nextjs` user with `chmod -R 777` on `/app/blastdb` and `/app/temp_queries`.
* **Database Baking**: Downloads and indexes Drosophila melanogaster cDNA, E. coli K-12, and Major Viruses during the container build step.

### 13.2 Google Cloud Run Deployment
* **Service Name**: `blasthub`
* **Region**: `us-central1` (Primary) & `us-east4` (Secondary)
* **Configuration**:
  * Memory: 4GiB (or 8GiB for Human Genome queries)
  * CPU: 2 vCPU
  * Concurrency: 80
  * Timeout: 900 seconds (15 minutes)

### 13.3 Live Custom Domain & CDN Cache Invalidation (`firebase.json`)
The live domain `superblast.app` is routed via Firebase Hosting rewrites to the Cloud Run container. To prevent CDN edge caching of dynamic search pages, strict cache busting is enforced:
```json
{
  "hosting": {
    "public": "public",
    "headers": [
      {
        "source": "**",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "no-cache, no-store, must-revalidate, max-age=0, s-maxage=0"
          }
        ]
      }
    ],
    "rewrites": [
      {
        "source": "**",
        "run": {
          "serviceId": "blasthub",
          "region": "us-central1"
        }
      }
    ]
  }
}
```

---

## 14. Security & Environment Configuration

### Required Environment Variables (`.env.local`)
```ini
# Google Gemini AI API Key (Optional: enables Gemini 2.5 Pro; local fallback used if omitted)
GEMINI_API_KEY=your_gemini_api_key_here

# Firebase Public Configuration (Safe for client-side bundle)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=super-blast-497610.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=super-blast-497610
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=super-blast-497610.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=523316980019
NEXT_PUBLIC_FIREBASE_APP_ID=1:523316980019:web:...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=523316980019-...apps.googleusercontent.com

# Server-Side Firebase Admin (Auto-detected on Cloud Run via GCP IAM; local requires service account key)
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

---

## 15. Offline Completeness & Standalone Execution

Super BLAST is architected to run completely offline without cloud dependencies:

1. **Standalone Execution**:
   Running `docker-compose up --build` launches the full container containing Node.js, NCBI BLAST+ 2.17.0, and the pre-indexed reference databases.
2. **Local AI Fallback**:
   When offline, `/api/blast/analyze` automatically falls back to deterministic local biological summary calculation.
3. **Local Storage Fallback**:
   If Firestore is unreachable, the application persists all job metadata and alignments to the browser's `localStorage`.

---

## 16. Testing Report & Verification

### Executed Verifications
1. **Per-Query Summary Crash Fix**:
   * Verified fix for `[].reduce()` crash on empty query subsets in `src/app/search/[jobId]/page.js` line 718.
2. **Live Domain Freshness Check**:
   * Verified `force-dynamic` headers on `https://superblast.app` ensuring live deployments immediately reflect code changes without stale CDN edge caching.
3. **BLAST+ Engine Execution**:
   * Executed test queries against Drosophila, E. coli, and Viral databases; confirmed valid JSON-15 parsing and alignment coordinate extraction.
4. **Excel and PDF Exporters**:
   * Verified multi-sheet workbook generation and landscape PDF document generation.

---

## 17. Known Issues & Maintenance Guidelines

1. **Human Genome Index Size**:
   * Indexing the complete human genome (~3.2GB) requires at least 4GB of RAM and ~5-8 minutes on the first query if not pre-cached on persistent disk.
2. **Temporary File Accumulation**:
   * The background sweeper in `cleanupTemp.js` handles disk maintenance. In ephemeral serverless environments, container recycling automatically flushes `/app/temp_queries`.

---

## 18. Recommendations & Future Roadmap

1. **Pre-Index Human Genome in Volume Mount**:
   * Mount a Cloud Storage bucket or Persistent Disk with pre-indexed GRCh38 to eliminate on-demand indexing overhead.
2. **Protein BLAST Support (`blastp`, `blastx`)**:
   * Extend UI to accept amino acid sequences and index Swiss-Prot / UniProt reference databases.
3. **Phylogenetic Tree Visualization**:
   * Ingest alignment outputs into an interactive D3 / Phylocanvas phylogenetic tree viewer.

---
*Documentation compiled and verified forensically against codebase commit state.*
