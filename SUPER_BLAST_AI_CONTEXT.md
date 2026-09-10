# Super BLAST — High-Density AI Context Document

**System**: Super BLAST / BLASTHub v2.0  
**Purpose**: Complete bioinformatic and algorithmic state snapshot for LLM context windows.  
**Root Path**: `F:\VS Code Folder\Super BLAST\SUPER_BLAST`  

---

## 1. Core Data Models & Schemas

### 1.1 Submission Payload (`POST /api/blast/submit`)
```typescript
interface SubmitRequest {
  sequences: Array<{
    filename: string;
    content: string; // Multi-line FASTA string starting with '>'
  }>;
  config: {
    program: 'blastn';
    database: 'drosophila' | 'ecoli' | 'viruses' | 'human';
    evalue: string; // e.g. '0.01'
    maxTargetSeqs: string; // '1' to '500'
    task: 'megablast' | 'dc-megablast' | 'blastn';
  };
}
```

### 1.2 Normalized Hit Object (`allHits` array)
```typescript
interface BlastHit {
  queryTitle: string;        // e.g. "Seq_1"
  queryLen: number;          // e.g. 500 bp
  subjectAcc: string;        // NCBI Accession e.g. "NM_001274433.2"
  subjectTitle: string;      // Full description line
  subjectSciName: string;    // Scientific name e.g. "Drosophila melanogaster"
  subjectTaxId: number;      // NCBI Taxonomy ID
  subjectLen: number;        // Total subject length in bp
  identity: number;          // Percent identity e.g. 99.4
  identityCount: number;     // Number of matching bases
  queryCoverage: number;     // Alignment length / queryLen * 100
  alignmentLength: number;   // Total aligned bases including gaps
  mismatches: number;        // Mismatched positions
  gapOpens: number;          // Number of gap openings
  evalue: number;            // Expectation value (e.g. 1.2e-45)
  bitScore: number;          // Normalized bit score (e.g. 850.2)
  score: number;             // Raw alignment score
  qStart: number;            // Query start position (1-indexed)
  qEnd: number;              // Query end position
  sStart: number;            // Subject start position
  sEnd: number;              // Subject end position
  queryStrand: string;       // "Plus" or "Minus"
  hitStrand: string;         // "Plus" or "Minus"
  qseq: string;              // Aligned query sequence with '-' gaps
  hseq: string;              // Aligned subject sequence with '-' gaps
  midline: string;           // Match line ('|' for match, ' ' for mismatch/gap)
  rid: string;               // Batch Request ID
}
```

### 1.3 Firestore Document Schema (`jobs/{jobId}`)
```typescript
interface FirestoreJobRecord {
  id: string;                // e.g. "job-kv89z31p"
  uid: string;               // Firebase User ID or "anonymous"
  createdAt: string;         // ISO timestamp
  updatedAt: string;         // ISO timestamp
  status: 'processing' | 'completed' | 'terminated' | 'failed';
  totalFiles: number;
  fileNames: string[];
  config: SubmitRequest['config'];
  jobs: Array<{
    rid: string;
    filename: string;
    count: number;
  }>;
  errors?: Array<{ filename: string; error: string }>;
}
```

---

## 2. Directory Structure & Key Symbols

* `src/lib/nativeBlast.js`:
  * `runNativeBlast(queryContent, config)` -> Spawns `blastn`, parses JSON 15, returns `{ hits, queries, stats }`.
  * `parseBlastJson15(jsonData)` -> Extracts iterative search queries and HSPs into flattened `BlastHit` items.
* `src/lib/dbManager.js`:
  * `checkDatabaseReady(dbKey)` -> Verifies `.nhr`, `.nin`, `.nsq` binary indices exist.
  * `ensureDatabase(dbKey)` -> Downloads FASTA and indexes via `makeblastdb` if missing.
* `src/lib/firestoreJobs.js`:
  * `saveJob(uid, jobData)`, `getJobById(jobId)`, `getUserJobs(uid)`, `updateJobById(jobId, updates)`, `deleteJobById(jobId)`.
* `src/lib/cleanupTemp.js`:
  * `cleanupOldFiles(tempDir, maxAgeMs)` -> Purges ephemeral query and result files older than 1 hour.
* `src/app/api/blast/analyze/route.js`:
  * `POST` endpoint sending rich markdown prompt to `gemini-2.5-pro` with `generateFallbackAnalysis()` fallback.
* `src/app/search/[jobId]/page.js`:
  * Results page rendering 60bp alignment blocks (`renderAlignment`), tabs (Table, Alignment, Summary), and exports.

---
*High-density context snapshot verified.*
