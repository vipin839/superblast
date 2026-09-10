#!/usr/bin/env bash
#
# Final gate on the base image.
#
# Every database must open, and every database must resolve its organism to a
# scientific name. A database whose hits carry no `sciname` renders the results
# table's Organism column useless and strips taxonomy from the AI prompt, so it
# is treated as a build failure rather than a warning.
#
set -euo pipefail

DB=${DBDIR:-/app/blastdb}
FAILED=0

for db in drosophila drosophila_genome ecoli sarscov2 viruses; do
  echo "== verifying ${db} =="

  if ! blastdbcmd -info -db "${DB}/${db}" > /dev/null 2>&1; then
    echo "   FATAL: blastdbcmd cannot open ${db}" >&2
    FAILED=1
    continue
  fi

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
done

if [ "${FAILED}" -ne 0 ]; then
  echo "One or more BLAST databases failed verification." >&2
  exit 1
fi

echo "All BLAST databases verified, with taxonomy."
