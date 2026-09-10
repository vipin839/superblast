# BLASTHub

**Bulk sequence search on managed NCBI BLAST+ infrastructure — all five BLAST
programs, with interactive alignment inspection and publication-ready export.**

[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![BLAST+](https://img.shields.io/badge/NCBI%20BLAST%2B-2.17.0-informational.svg)](https://blast.ncbi.nlm.nih.gov/)

Live instance: **<https://superblast.app>**

BLASTHub runs genuine BLAST+ searches — `blastn`, `blastp`, `blastx`, `tblastn`
and `tblastx` — against pre-indexed reference databases, and returns the native
NCBI JSON-15 output parsed into a sortable hit table with per-HSP alignments.
It is a managed front end to BLAST+ — not a reimplementation, and not a queue
in front of the public NCBI service.

Nucleotide and protein databases are provided for each model organism, so every
program has a compatible target. Incompatible program/database or
program/query pairings are rejected with an explanatory message before a
process is spawned.

---

## Contents

- [What it does](#what-it-does)
- [Reference databases](#reference-databases)
- [Validation](#validation)
- [Running it yourself](#running-it-yourself)
- [Architecture](#architecture)
- [Reproducibility notes](#reproducibility-notes)
- [Limitations](#limitations)
- [Citing](#citing)
- [Licence](#licence)

---

## What it does

| | |
|---|---|
| **Intake** | Up to 100 FASTA files per submission, validated for header structure and for the molecule the chosen program requires |
| **Search** | NCBI BLAST+ 2.17.0 — all five programs: `blastn`, `blastp`, `blastx`, `tblastn`, `tblastx`, with per-program task and word-size validation; native `-outfmt 15` JSON output |
| **Results** | Sortable and filterable by identity, coverage, E-value, bit score, organism or accession; per-HSP pairwise alignment with matches, mismatches and gaps marked |
| **Interpretation** | Optional AI summary via the Gemini API — see [Reproducibility notes](#reproducibility-notes) before relying on it |
| **Export** | Multi-sheet Excel workbook (one sheet per query), landscape PDF report, raw JSON and CSV |

Reported metrics include percent identity, alignment length, mismatches, query
and subject coverage, E-value, bit score, raw score, strand orientation, and
**both** gap measures — gap *openings* (maximal runs of `-`, counted on both
strands) and gap *positions* (`hsp.gaps` from BLAST) — reported separately
rather than conflated.

## Reference databases

Every figure below was measured by `blastdbcmd -info` inside the production
image. Provenance, source URLs and SHA-256 checksums are in
[docs/DATABASES.md](docs/DATABASES.md).

| Key | Organism | Accession | Molecule | Sequences | Letters |
|---|---|---|---|---|---|
| `drosophila` | *Drosophila melanogaster* | GCF_000001215.4 | RNA | 34,526 | 92,449,215 bases |
| `drosophila_genome` | *Drosophila melanogaster* | GCF_000001215.4 | Genomic DNA | 1,870 | 143,726,002 bases |
| `drosophila_protein` | *Drosophila melanogaster* | GCF_000001215.4 | Protein | 30,802 | 20,379,498 residues |
| `ecoli` | *E. coli* K-12 MG1655 | GCF_000005845.2 | Genomic DNA | 1 | 4,641,652 bases |
| `ecoli_protein` | *E. coli* K-12 MG1655 | GCF_000005845.2 | Protein | 4,300 | 1,330,036 residues |
| `yeast_genome` | *S. cerevisiae* S288C | GCF_000146045.2 | Genomic DNA | 17 | 12,157,105 bases |
| `yeast` | *S. cerevisiae* S288C | GCF_000146045.2 | RNA | 6,138 | 8,873,817 bases |
| `yeast_protein` | *S. cerevisiae* S288C | GCF_000146045.2 | Protein | 6,021 | 2,933,360 residues |
| `sarscov2` | SARS-CoV-2 | NC_045512.2 | Viral genomic | 1 | 29,903 bases |
| `sarscov2_protein` | SARS-CoV-2 | GCF_009858895.2 | Protein | 12 | 14,149 residues |
| `viruses` | SARS-CoV-2 + HIV-1 | NC_045512.2, NC_001802.1 | Viral genomic | 2 | 39,084 bases |

The whole set occupies 386 MB in the image, dominated by NCBI's taxonomy
tables rather than the sequence indexes.

Each database is built with `makeblastdb -dbtype {nucl|prot} -parse_seqids -taxid <n>`
and the image carries NCBI's `taxdb`, so every hit resolves to a scientific
name and taxonomy ID. The build **fails** if any database cannot be opened by
`blastdbcmd` or does not resolve an organism name, and CI additionally runs
one search per program to prove each database is searchable:

```
blastn    -> ecoli            OK      blastp    -> ecoli_protein    OK
blastx    -> ecoli_protein    OK      tblastn   -> ecoli            OK
tblastx   -> sarscov2         OK
```

The human GRCh38.p14 database is registered but deliberately **disabled**; see
[Limitations](#limitations).

## Validation

`scripts/validate-blast.sh` runs inside the production image and is executed by
`cloudbuild-validate.yaml`. Every query is extracted from the database under
test with `blastdbcmd`, so no sequence is invented and each expected result is
independently checkable.

```bash
gcloud builds submit --config cloudbuild-validate.yaml .
```

Representative results:

| Test | Query | Result |
|---|---|---|
| Positive control | `NT_033777.3:5000000-5000599` (*D. melanogaster* chr 3R) | 100.000% identity, 600/600, 0 gaps, E = 0.0, 1109 bits |
| Positive control | `NC_045512.2:21563-22162` (SARS-CoV-2 spike region) | 100.000% identity, E = 0.0 |
| Negative control | SARS-CoV-2 fragment vs *D. melanogaster* genome | no hits at E < 1e-5 |
| Negative control | *E. coli* fragment vs SARS-CoV-2 | no hits at E < 1e-5 |

An independent biological check: querying an *E. coli* 16S rRNA sequence
against `ecoli` returns exactly **seven** hits, at the chromosomal coordinates
of the seven *rrn* operons, with *rrnG* and *rrnD* correctly reported on the
minus strand.

`scripts/check_json15.mjs` asserts the JSON-15 structure and independently
recomputes identity, coverage and gap openings from the alignment strings.

## Running it yourself

Requires Node.js 20+ and NCBI BLAST+ 2.17.0 on `PATH`, or Docker.

```bash
git clone https://github.com/vipin839/superblast.git
cd superblast
npm ci
cp .env.example .env.local     # then fill in the values
npm run dev                    # http://localhost:3000
```

With Docker, which also builds the reference databases:

```bash
docker build -f Dockerfile.base -t blasthub-base:local .
docker build --build-arg BASE_IMAGE=blasthub-base --build-arg BASE_TAG=local -t blasthub:local .
docker run -p 8080:8080 --env-file .env.local blasthub:local
```

Environment variables are classified (public / server-only / secret) in
[.env.example](.env.example). Deployment, rollback and required Cloud Run
configuration are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

```bash
npm run lint     # must report 0 errors
npm test         # 130 tests
npm run build
```

## Architecture

```
browser → Firebase Auth (Google) → ID token
        → Firebase Hosting → Cloud Run (Next.js standalone)
            ├─ requireAuth()  verifies the token server-side
            ├─ assertOwner()  compares job.uid to the verified uid
            ├─ BLAST+         spawn(), no shell, program-validated
            ├─ Firestore      job metadata and ownership
            └─ Cloud Storage  result payloads, shared across instances
```

Every `/api/*` route verifies a Firebase ID token server-side and derives the
caller's identity from that token alone; no route accepts a user ID from a
query string or request body. Full detail, including the deliberate design
trade-offs, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Reproducibility notes

**BLAST results are reproducible.** The BLAST+ version, database accessions,
assembly identifiers and SHA-256 checksums are pinned and recorded, so a given
query against a given database version yields the same alignments.

**The AI interpretation is not.** The Gemini model is selected from a candidate
list in `GEMINI_MODEL`, generation is non-deterministic, and the default entries
are moving aliases that the provider repoints without notice. The response
always reports which model actually answered, and the interface labels a
non-model fallback as a deterministic local summary containing no inference —
but the text is **not** reproducible and has not been evaluated against expert
annotation. Treat it as an exploratory aid, verify every claim against the
alignments, and pin an explicit model version if you intend to cite its output.

## Limitations

Stated plainly rather than buried:

- **Human GRCh38.p14 is disabled.** The assembly needs ~3.2 GB expanded plus
  comparable scratch for `makeblastdb`; the deployment has 4 GiB of RAM-backed
  writable storage and a 300 s request timeout. It is reported as `UNAVAILABLE`
  with that reason rather than offered and failing.
- **Rate limits are per-instance.** Counters live in one instance's memory, so
  a caller spread across instances can exceed them. They are a cost guard, not
  a security boundary.
- **Job cancellation is best-effort across instances.** A cancel that reaches
  the instance running the search kills the process; one that reaches another
  instance marks the search cancelled and says so explicitly in the response.
- **Result payloads are retained for one year**, then removed by a bucket
  lifecycle rule. Job metadata persists in history.
- **No published benchmark** against standalone BLAST+ or the NCBI web service.

## Citing

If this software contributes to work you publish, please cite it using the
metadata in [CITATION.cff](CITATION.cff), and cite BLAST+ itself:

> Camacho C, Coulouris G, Avagyan V, Ma N, Papadopoulos J, Bealer K, Madden TL.
> BLAST+: architecture and applications. *BMC Bioinformatics*. 2009;10:421.

Please also cite the reference assemblies you searched against; accessions are
in [docs/DATABASES.md](docs/DATABASES.md).

## Licence

[MIT](LICENSE). BLAST+ is a US Government Work in the public domain; BLAST® is
a registered trademark of the National Library of Medicine. Reference data is
from NCBI and remains subject to NCBI's data usage policies.
