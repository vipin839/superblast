#!/usr/bin/env bash
#
# Download a FASTA from NCBI, build a BLAST+ database from it, and refuse to
# finish unless BLAST+ itself confirms the result is readable.
#
# Usage: build-blastdb.sh <db-name> <url> <title> [taxid|@taxid-map-file]
#
# Environment:
#   DBTYPE   nucl (default) or prot. Protein databases produce a different set
#            of index files and report "total residues" rather than "total
#            bases", so both are handled below.
#   DBDIR    output directory, default /app/blastdb
#
# Supplying a taxid records taxonomy in the index so BLAST reports `sciname`
# and `taxid` for every hit. Without it those fields are absent and the UI
# shows "Unknown" for the organism of every result.
#
# Writes alongside the index:
#   metadata/<db>.meta.json   provenance and measured statistics
#   metadata/<db>.info.txt    raw `blastdbcmd -info` output
#
set -euo pipefail

NAME="$1"
URL="$2"
TITLE="$3"
TAXON="${4:-}"
DBTYPE="${DBTYPE:-nucl}"
DBDIR="${DBDIR:-/app/blastdb}"

case "$DBTYPE" in
  nucl) EXTS="ndb nhr nin nsq not ntf nto"; UNIT="bases" ;;
  prot) EXTS="pdb phr pin psq pot ptf pto"; UNIT="residues" ;;
  *) echo "[build-blastdb] FATAL — DBTYPE must be nucl or prot, got '$DBTYPE'" >&2; exit 1 ;;
esac

mkdir -p "$DBDIR" "$DBDIR/metadata"
cd "$DBDIR"

echo "[build-blastdb] ${NAME}: downloading ${URL}"
# --tries/--timeout so a stalled NCBI connection fails the build instead of hanging.
wget -q --tries=3 --timeout=60 -O "${NAME}.src.gz" "$URL"

FASTA="${NAME}.fa"
if gzip -t "${NAME}.src.gz" 2>/dev/null; then
  gunzip -c "${NAME}.src.gz" > "$FASTA"
else
  # Some endpoints (efetch) return plain text rather than gzip.
  mv "${NAME}.src.gz" "$FASTA"
fi
rm -f "${NAME}.src.gz"

FASTA_BYTES=$(stat -c%s "$FASTA")
FASTA_SHA=$(sha256sum "$FASTA" | cut -d' ' -f1)
SEQ_IN_FASTA=$(grep -c '^>' "$FASTA")

if [ "$SEQ_IN_FASTA" -eq 0 ]; then
  echo "[build-blastdb] ${NAME}: FATAL — downloaded file contains no FASTA records" >&2
  exit 1
fi

echo "[build-blastdb] ${NAME}: indexing ${SEQ_IN_FASTA} sequences as ${DBTYPE} (${FASTA_BYTES} bytes)"

TAX_ARGS=()
case "$TAXON" in
  "")   echo "[build-blastdb] ${NAME}: WARNING - no taxid supplied; hits will have no organism name" ;;
  @*)   MAPFILE="${TAXON#@}"
        echo "[build-blastdb] ${NAME}: using taxid map ${MAPFILE}"
        TAX_ARGS=(-taxid_map "$MAPFILE") ;;
  *)    echo "[build-blastdb] ${NAME}: tagging every sequence with taxid ${TAXON}"
        TAX_ARGS=(-taxid "$TAXON") ;;
esac

makeblastdb -in "$FASTA" -dbtype "$DBTYPE" -out "$NAME" -title "$TITLE" -parse_seqids "${TAX_ARGS[@]}"

# Authoritative readiness check: BLAST+ must be able to open its own index.
echo "[build-blastdb] ${NAME}: verifying with blastdbcmd -info"
blastdbcmd -info -db "$NAME" > "metadata/${NAME}.info.txt"
cat "metadata/${NAME}.info.txt"

SEQ_COUNT=$(grep -oP '^\s*\K[\d,]+(?=\s+sequences)' "metadata/${NAME}.info.txt" | head -1 | tr -d ,)
# Nucleotide databases report "total bases", protein databases "total residues".
TOTAL_LETTERS=$(grep -oP "sequences;\s+\K[\d,]+(?=\s+total ${UNIT})" "metadata/${NAME}.info.txt" | head -1 | tr -d ,)

if [ -z "${SEQ_COUNT:-}" ] || [ "$SEQ_COUNT" -eq 0 ]; then
  echo "[build-blastdb] ${NAME}: FATAL — database reports zero sequences" >&2
  exit 1
fi

# Every index file BLASTDB v5 needs must exist and be non-empty.
for ext in $EXTS; do
  if [ ! -s "${NAME}.${ext}" ]; then
    echo "[build-blastdb] ${NAME}: FATAL — missing or empty index file ${NAME}.${ext}" >&2
    exit 1
  fi
done

DB_BYTES=$(du -cb "${NAME}".[np]* 2>/dev/null | tail -1 | cut -f1)

cat > "metadata/${NAME}.meta.json" <<JSON
{
  "name": "${NAME}",
  "title": "${TITLE}",
  "dbType": "${DBTYPE}",
  "sourceUrl": "${URL}",
  "fastaBytes": ${FASTA_BYTES},
  "fastaSha256": "${FASTA_SHA}",
  "fastaRecords": ${SEQ_IN_FASTA},
  "sequenceCount": ${SEQ_COUNT},
  "totalLetters": ${TOTAL_LETTERS:-0},
  "letterUnit": "${UNIT}",
  "databaseBytes": ${DB_BYTES:-0},
  "taxid": "${TAXON}",
  "blastVersion": "$(blastn -version | head -1)",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

# The source FASTA is not needed at runtime; the index is self-contained.
rm -f "$FASTA"

echo "[build-blastdb] ${NAME}: OK — ${SEQ_COUNT} sequences, ${TOTAL_LETTERS:-?} ${UNIT}"
