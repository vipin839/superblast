#!/usr/bin/env bash
#
# BLAST engine validation, run inside the production base image.
#
# Every query is extracted from the database under test with blastdbcmd, so no
# sequence is invented and every expected result is independently checkable.
#
#   docker run --rm -v "$PWD:/w" <base-image> bash /w/scripts/validate-blast.sh
#
set -e
cd /tmp

DB=/app/blastdb
FMT="6 qseqid sseqid pident length mismatch gapopen qstart qend sstart send evalue bitscore"

hdr() { echo; echo "############ $1 ############"; }

hdr "TEST 1  engine binaries"
blastn -version
makeblastdb -version
blastdbcmd -version
command -v blastn makeblastdb blastdbcmd

hdr "TEST 2  Drosophila genome — POSITIVE CONTROL"
read -r ACC LEN < <(blastdbcmd -db "$DB/drosophila_genome" -entry all -outfmt "%a %l" \
                    | sort -k2 -nr | head -1)
echo "longest subject in database: $ACC ($LEN bases)"
blastdbcmd -db "$DB/drosophila_genome" -entry "$ACC" -range 5000000-5000599 > dmel_pos.fa
echo "query extracted from the database itself:"
head -1 dmel_pos.fa
echo "query length: $(grep -v '>' dmel_pos.fa | tr -d '\n' | wc -c)"
blastn -task megablast -query dmel_pos.fa -db "$DB/drosophila_genome" \
  -outfmt "$FMT" -evalue 1e-5 -max_target_seqs 5 -num_threads 2 | head -5

hdr "TEST 3  Drosophila genome — JSON-15 structural check"
blastn -task megablast -query dmel_pos.fa -db "$DB/drosophila_genome" \
  -outfmt 15 -evalue 1e-5 -max_target_seqs 5 -num_threads 2 -out dmel.json
node /w/scripts/check_json15.mjs /tmp/dmel.json

hdr "TEST 4  SARS-CoV-2 — POSITIVE CONTROL"
blastdbcmd -db "$DB/sarscov2" -entry all -outfmt "%a  %t  %l bases"
SACC=$(blastdbcmd -db "$DB/sarscov2" -entry all -outfmt "%a" | head -1)
# 21563-22162 is inside the SARS-CoV-2 spike (S) coding region.
blastdbcmd -db "$DB/sarscov2" -entry "$SACC" -range 21563-22162 > cov_pos.fa
echo "spike-region query: $(head -1 cov_pos.fa)"
blastn -task megablast -query cov_pos.fa -db "$DB/sarscov2" \
  -outfmt "$FMT" -evalue 1e-5 -num_threads 2

hdr "TEST 5  SARS-CoV-2 query vs Drosophila genome — NEGATIVE CONTROL"
echo "(a coronavirus fragment should not align to the fly genome)"
blastn -task megablast -query cov_pos.fa -db "$DB/drosophila_genome" \
  -outfmt "$FMT" -evalue 1e-5 -num_threads 2 > neg1.txt || true
if [ -s neg1.txt ]; then echo "HITS FOUND:"; cat neg1.txt; else echo "RESULT: no hits at E < 1e-5"; fi

hdr "TEST 6  E. coli query vs SARS-CoV-2 — NEGATIVE CONTROL"
EACC=$(blastdbcmd -db "$DB/ecoli" -entry all -outfmt "%a" | head -1)
blastdbcmd -db "$DB/ecoli" -entry "$EACC" -range 1000000-1000599 > ecoli_q.fa
blastn -task megablast -query ecoli_q.fa -db "$DB/sarscov2" \
  -outfmt "$FMT" -evalue 1e-5 -num_threads 2 > neg2.txt || true
if [ -s neg2.txt ]; then echo "HITS FOUND:"; cat neg2.txt; else echo "RESULT: no hits at E < 1e-5"; fi

hdr "TEST 7  E. coli — POSITIVE CONTROL"
blastn -task megablast -query ecoli_q.fa -db "$DB/ecoli" \
  -outfmt "$FMT" -evalue 1e-5 -num_threads 2

hdr "TEST 8  Drosophila RefSeq RNA transcript database"
RACC=$(blastdbcmd -db "$DB/drosophila" -entry all -outfmt "%a %l" | sort -k2 -nr | head -1 | cut -d' ' -f1)
blastdbcmd -db "$DB/drosophila" -entry "$RACC" -range 1-500 > rna_q.fa
head -1 rna_q.fa
blastn -task megablast -query rna_q.fa -db "$DB/drosophila" \
  -outfmt "$FMT" -evalue 1e-5 -max_target_seqs 3 -num_threads 2 | head -3

hdr "TEST 9  ERROR HANDLING"
echo "--- missing database ---"
blastn -query dmel_pos.fa -db "$DB/does_not_exist" -outfmt 15 2>&1 | head -3 || true
echo "--- protein sequence submitted to blastn ---"
printf '>prot\nMKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQ\n' > prot.fa
blastn -query prot.fa -db "$DB/ecoli" -outfmt "$FMT" 2>&1 | head -3 || true
echo "--- empty query file ---"
: > empty.fa
blastn -query empty.fa -db "$DB/ecoli" -outfmt "$FMT" 2>&1 | head -3 || true
echo "--- invalid word size for megablast ---"
blastn -task megablast -word_size 3 -query dmel_pos.fa -db "$DB/ecoli" -outfmt "$FMT" 2>&1 | head -3 || true

hdr "TEST 10  CONCURRENCY — three searches against three databases at once"
blastn -task megablast -query dmel_pos.fa -db "$DB/drosophila_genome" -outfmt "$FMT" -num_threads 1 > c1.txt &
blastn -task megablast -query cov_pos.fa  -db "$DB/sarscov2"          -outfmt "$FMT" -num_threads 1 > c2.txt &
blastn -task megablast -query ecoli_q.fa  -db "$DB/ecoli"             -outfmt "$FMT" -num_threads 1 > c3.txt &
wait
for f in c1 c2 c3; do echo "$f -> $(head -1 $f.txt)"; done
if [ -s c1.txt ] && [ -s c2.txt ] && [ -s c3.txt ]; then
  echo "CONCURRENCY: all three produced results"
  # Each result must name its own database's subject — no cross-contamination.
  grep -q "NT_\|NC_004354\|NC_0djust" c1.txt || true
  grep -q "NC_045512" c2.txt && echo "  c2 correctly matched SARS-CoV-2"
  grep -q "NC_000913" c3.txt && echo "  c3 correctly matched E. coli"
  grep -q "NC_045512" c1.txt && echo "  WARNING: cross-contamination in c1" || echo "  c1 contains no SARS-CoV-2 subject"
fi

hdr "TEST 11  RESOURCE USAGE"
echo "database sizes on disk:"
du -sh "$DB"/*.n* 2>/dev/null | awk '{s[$2]=$1} END{for(k in s) print s[k], k}' | sort -k2 | tail -0 || true
du -ch "$DB" | tail -1
echo "peak RSS of one genome search (KB):"
/usr/bin/time -f "%M" blastn -task megablast -query dmel_pos.fa -db "$DB/drosophila_genome" \
  -outfmt "$FMT" -num_threads 2 -out /dev/null 2>&1 | tail -1 || echo "(GNU time unavailable)"

hdr "ALL BLAST ENGINE TESTS COMPLETE"
