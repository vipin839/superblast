# BLASTHub — reference databases

Every figure below was **measured** by `blastdbcmd -info` inside the image
during Cloud Build `40c890f9-2ab7-4ec7-9c2c-27635e5db8f8` on 10 September 2026,
image tag `blasthub-base:blast2.17.0-db2`, BLAST+ 2.17.0 (build 1 Jul 2025).
Nothing here is estimated.

## Contents

| Key | Organism | NCBI accession | Assembly | Molecule | Sequences | Total bases | Index on disk |
|---|---|---|---|---|---|---|---|
| `drosophila` | *Drosophila melanogaster* | GCF_000001215.4 | Release 6 plus ISO1 MT | RefSeq RNA (transcripts) | 34,526 | 92,449,215 | 31.6 MB |
| `drosophila_genome` | *Drosophila melanogaster* | GCF_000001215.4 | Release 6 plus ISO1 MT | Genomic DNA | 1,870 | 143,726,002 | 36.4 MB |
| `ecoli` | *Escherichia coli* K-12 MG1655 | GCF_000005845.2 | ASM584v2 | Genomic DNA | 1 | 4,641,652 | 1.2 MB |
| `sarscov2` | SARS-CoV-2 | GCF_009858895.2 (NC_045512.2) | ASM985889v3 | Viral genomic | 1 | 29,903 | 57.6 kB |
| `viruses` | SARS-CoV-2 + HIV-1 | NC_045512.2, NC_001802.1 | RefSeq reference genomes | Viral genomic | 2 | 39,084 | 60.0 kB |
| `human` | *Homo sapiens* | GCF_000001405.40 | GRCh38.p14 | Genomic DNA | — | — | **not provisioned** |

Cross-checks against published values: E. coli K-12 MG1655 is 4,641,652 bp and
SARS-CoV-2 NC_045512.2 is 29,903 bp — both match exactly. The *D.
melanogaster* Release 6 assembly totals 143.7 Mb with a longest sequence of
32,079,331 bases (chromosome arm 3R).

## Provenance and checksums

Source FASTA, SHA-256 of the downloaded file, and the BLASTDB v5 index size:

| Key | Source URL | FASTA bytes | SHA-256 |
|---|---|---|---|
| `drosophila` | `https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/000/001/215/GCF_000001215.4_Release_6_plus_ISO1_MT/GCF_000001215.4_Release_6_plus_ISO1_MT_rna.fna.gz` | 96,785,880 | `7514988d48f0cffa9c8ab6490f892bdfc62de8d9bdd415e4ad411908980a1655` |
| `drosophila_genome` | `…/GCF_000001215.4_Release_6_plus_ISO1_MT_genomic.fna.gz` | 145,657,746 | `4e14dbd8ea213a19ebf27057ab62a57ca83951e79ae0c2501ae4c460b7c3d415` |
| `ecoli` | `https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/000/005/845/GCF_000005845.2_ASM584v2/GCF_000005845.2_ASM584v2_genomic.fna.gz` | 4,699,745 | `53bb6a51b6e92139ced1e38f74b7938781027c52200922ff03718c2237d23bb4` |
| `sarscov2` | `https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/009/858/895/GCF_009858895.2_ASM985889v3/GCF_009858895.2_ASM985889v3_genomic.fna.gz` | 30,374 | `b0540238e8b48a5ce25dffafb94b1a9be507b161dea2a166d09a9565381f94eb` |
| `viruses` | `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=NC_045512.2,NC_001802.1&rettype=fasta&retmode=text` | 39,804 | `e6e27489e3b14af67f9d0d5d6a78895055761882193d921331bb1a33207df090` |

The same values are written into the image at
`/app/blastdb/metadata/<db>.meta.json`, alongside the raw `blastdbcmd -info`
output at `/app/blastdb/metadata/<db>.info.txt`.

## Taxonomy

Each database is built with `makeblastdb -taxid <n>` (or `-taxid_map` for the
mixed viral set), and the image carries NCBI's `taxdb.btd`/`taxdb.bti` lookup
tables. Without both, BLAST+ emits hits with no `sciname` and no `taxid`, the
results table's Organism column reads "Unknown" for every row, and the AI
prompt loses taxonomic context entirely. That was the state before 10 September
2026 — it was caught by the JSON-15 structural check, not by any user-visible
error.

| Key | NCBI taxonomy ID | Organism |
|---|---|---|
| `drosophila`, `drosophila_genome` | 7227 | *Drosophila melanogaster* |
| `ecoli` | 511145 | *Escherichia coli* str. K-12 substr. MG1655 |
| `sarscov2` | 2697049 | Severe acute respiratory syndrome coronavirus 2 |
| `viruses` | 2697049, 11676 | SARS-CoV-2; Human immunodeficiency virus 1 |

`scripts/verify-blastdbs.sh` runs as the last step of the base image build and
**fails the build** if any database resolves to an empty scientific name or a
zero taxid.

## Why the human genome is disabled

`human` is registered with `selectable: false` and a stated reason. It is not
hidden and not silently broken — `/api/databases` reports state `UNAVAILABLE`
with the explanation, and the UI disables the option.

The GRCh38.p14 assembly is roughly 3.2 GB expanded, and `makeblastdb` needs
comparable scratch space on top of that. The Cloud Run instance has 4 GiB of
memory backing a RAM-based writable filesystem and a 300 s request timeout, so
provisioning it inside a user request cannot succeed. The previous code
offered it as available and every search against it failed.

To enable it properly you would: build the index offline, add it to
`Dockerfile.base` (which pushes the image past ~5 GB), or mount a Cloud
Storage FUSE volume or a Filestore share holding a pre-built index — then set
`selectable: true` in `src/lib/dbManager.js`.

## Readiness is verified, not assumed

`checkDatabaseStatus()` returns one of:

| State | Meaning |
|---|---|
| `NOT_CONFIGURED` | none of the index files are present |
| `UNAVAILABLE` | registered but deliberately not offered (`human`) |
| `INCOMPLETE` | some index files present, others missing or zero-length |
| `CORRUPT` | files present but `blastdbcmd -info` fails, or reports zero sequences |
| `READY` | all index files present; with `deep: true`, BLAST+ opened it successfully |

All seven BLASTDB v5 files must exist and be non-empty:
`.ndb .nhr .nin .nsq .not .ntf .nto`. The original code checked only `.ndb`,
so a half-written database reported as ready.

`GET /api/databases?deep=1` runs the `blastdbcmd` probe per database.

## Rebuilding

```bash
# 1. Edit the database list in Dockerfile.base
# 2. Bump the tag in cloudbuild-base.yaml AND the BASE_TAG arg in Dockerfile
gcloud builds submit --config cloudbuild-base.yaml --project super-blast-497610 .
```

`scripts/build-blastdb.sh` runs per database and **fails the build** if the
download yields no FASTA records, `blastdbcmd -info` cannot open the result,
the sequence count is zero, or any required index file is missing. A corrupt
database therefore cannot ship.

## Validating

```bash
gcloud builds submit --config cloudbuild-validate.yaml --project super-blast-497610 .
```

This runs `scripts/validate-blast.sh` inside the base image: engine versions,
positive controls (a query extracted from each database with `blastdbcmd`,
re-searched against it — must self-hit at ~100% identity and E ≤ 1e-50),
cross-organism negative controls, JSON-15 structural validation
(`scripts/check_json15.mjs`), error handling, and concurrent searches across
three databases.

At runtime, an administrator (`ADMIN_EMAILS`) can call:

```bash
curl -H "Authorization: Bearer <ID_TOKEN>" https://superblast.app/api/blast/test
```

## Adding a database

1. Add a `build-blastdb.sh` line to `Dockerfile.base`.
2. Add an entry to `DATABASE_REGISTRY` in `src/lib/dbManager.js` with the real
   organism, accession and assembly — every field must be true.
3. Add a timeout to `DB_TIMEOUTS` proportional to the database size.
4. Add an entry to `DATABASES` in `src/lib/format.js` for the picker.
5. Bump the base tag, rebuild, validate, redeploy.

## Troubleshooting

| Symptom | Cause | Action |
|---|---|---|
| `state: INCOMPLETE` | interrupted `makeblastdb`, or an image built before all files were written | rebuild the base image |
| `state: CORRUPT` | index unreadable by BLAST+ | check `blastdbcmd -info` output in the build log |
| `Database "x" is not available` at submit | the base tag in `Dockerfile` predates the database | bump `BASE_TAG` and rebuild the app image |
| Search times out | query too long for the database's `DB_TIMEOUTS` entry | raise the timeout or shorten the query |
| No hits where hits are expected | wrong database selected (RNA vs genome), or E-value threshold too strict | check `config.database`; try `dc-megablast` for divergent matches |
