#!/usr/bin/env bash
#
# Final gate on the base image.
#
# Every database must open, and every database must resolve its organism to a
# scientific name. A database whose hits carry no `sciname` renders the results
# table's Organism column useless and strips taxonomy from the AI prompt, so it
# is treated as a build failure rather than a warning.
#
# Also proves each database is usable by the BLAST programs that target it —
# an index that opens but cannot be searched is not "ready".
#
set -euo pipefail

DB=${DBDIR:-/app/blastdb}
FAILED=0

NUCL_DBS="drosophila drosophila_genome ecoli yeast yeast_genome sarscov2 viruses"
PROT_DBS="drosophila_protein ecoli_protein yeast_protein sarscov2_protein"

check() {
  local db="$1" kind="$2"
  echo "== ${db} (${kind}) =="

  if ! blastdbcmd -info -db "${DB}/${db}" > /tmp/info.txt 2>&1; then
    echo "   FATAL: blastdbcmd cannot open ${db}" >&2
    sed 's/^/     /' /tmp/info.txt >&2
    FAILED=1
    return
  fi
  sed -n '2p' /tmp/info.txt | sed 's/^/   /'

  local name taxid
  name=$(blastdbcmd -db "${DB}/${db}" -entry all -outfmt "%S" 2>/dev/null | head -1 || true)
  taxid=$(blastdbcmd -db "${DB}/${db}" -entry all -outfmt "%T" 2>/dev/null | head -1 || true)
  echo "   organism : ${name:-<none>}"
  echo "   taxid    : ${taxid:-<none>}"

  if [ -z "${name}" ] || [ "${name}" = "N/A" ]; then
    echo "   FATAL: ${db} reports no scientific name; taxonomy is missing" >&2
    FAILED=1
  fi
  if [ -z "${taxid}" ] || [ "${taxid}" = "0" ]; then
    echo "   FATAL: ${db} reports taxid 0; makeblastdb was run without -taxid" >&2
    FAILED=1
  fi
}

for db in $NUCL_DBS; do check "$db" nucleotide; done
for db in $PROT_DBS; do check "$db" protein; done

# ── Prove each program can actually search the databases it targets ────────
echo
echo "== program/database compatibility =="
printf '>n\nATGGCTAGCTAGCTAGCATCGATCGATCGTAGCTAGCTAGCATCGATCGATCGTAGCTAGC\n' > /tmp/n.fa
printf '>p\nMKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKA\n' > /tmp/p.fa

run() {
  local prog="$1" query="$2" db="$3"
  printf "   %-9s -> %-20s " "$prog" "$db"
  if $prog -query "$query" -db "${DB}/${db}" -outfmt 6 -evalue 10 -max_target_seqs 5 \
       > /tmp/out.txt 2>/tmp/err.txt; then
    echo "OK ($(wc -l < /tmp/out.txt) hits)"
  else
    echo "FAILED"; sed 's/^/       /' /tmp/err.txt >&2; FAILED=1
  fi
}

run blastn  /tmp/n.fa ecoli
run blastp  /tmp/p.fa ecoli_protein
run blastx  /tmp/n.fa ecoli_protein
run tblastn /tmp/p.fa ecoli
run tblastx /tmp/n.fa sarscov2

if [ "${FAILED}" -ne 0 ]; then
  echo "One or more BLAST databases failed verification." >&2
  exit 1
fi

echo
echo "All BLAST databases verified, with taxonomy, across all five programs."
