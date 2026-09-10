# BLASTHub — reference databases

Every figure below was **measured** by `blastdbcmd -info` inside the image
during Cloud Build `faca50b8-77fc-4a86-83a9-455a3fb20ca4` on 10 September 2026,
image tag `blasthub-base:blast2.17.0-db4`, BLAST+ 2.17.0 (build 1 Jul 2025).
Nothing here is estimated.

## Programs

All five BLAST+ search programs are installed and verified in CI. Each is
paired with the molecule of database it can search; the application rejects an
incompatible pairing before spawning a process.

| Program | Query | Database | Translation |
|---|---|---|---|
| `blastn` | nucleotide | nucleotide | none |
| `blastp` | protein | protein | none |
| `blastx` | nucleotide | protein | query, 6 frames |
| `tblastn` | protein | nucleotide | database, 6 frames |
| `tblastx` | nucleotide | nucleotide | both, 6 frames each |

## Contents

Nucleotide and protein sets are provided for each organism, so every program
has a compatible target.

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
| `human` | *Homo sapiens* | GCF_000001405.40 | Genomic DNA | — | **not provisioned** |

Independent cross-checks: *E. coli* K-12 MG1655 is 4,641,652 bp and SARS-CoV-2
NC_045512.2 is 29,903 bp — both exact. The *S. cerevisiae* R64 assembly has 17
sequences (16 chromosomes plus the mitochondrion) totalling 12.16 Mb, and
SARS-CoV-2 encodes 12 annotated proteins. The *D. melanogaster* Release 6
assembly totals 143.7 Mb, longest sequence 32,079,331 bases (chromosome 3R).

## Size

The database directory is **386 MB**, dominated by NCBI's `taxdb` taxonomy
tables rather than by the sequence indexes; the eleven databases together
download as roughly 90 MB of compressed FASTA. It all sits inside the base
image, so it is fetched once per base-image rebuild and never during an
application deploy or a user request.

## Provenance and checksums

Source URL, SHA-256 of the downloaded FASTA, record counts and the resulting
index size are written into the image for every database at
`/app/blastdb/metadata/<db>.meta.json`, alongside the raw `blastdbcmd -info`
output at `/app/blastdb/metadata/<db>.info.txt`.

All sources are NCBI RefSeq under
`https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/...`, except `viruses`, which is
fetched from NCBI E-utilities by accession. The exact URL for each database is
declared in `Dockerfile.base`.

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
