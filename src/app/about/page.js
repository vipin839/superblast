'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Button, Card, Icons as I, useToast } from '@/components/ui';

const CONTACT_EMAIL = 'sainivipin839@gmail.com';
const REPO_URL = 'https://github.com/vipin839/superblast';
const CONCEPT_DOI = '10.5281/zenodo.22688703';
const ORCID = '0009-0005-2924-7095';

/**
 * The three routes tried before the current one. Each is recorded with the
 * constraint that ended it, because "we tried X" is only useful if it says why
 * X stopped working.
 */
const APPROACHES = [
  {
    n: '01',
    t: 'BLAST inside a spreadsheet',
    d: 'The first attempt kept the biologist in the tool they already use, driving BLAST from Microsoft Excel. It broke on bulk work: the spreadsheet is a poor place to hold sequence data, and nothing about the approach removed the need for a local BLAST+ installation underneath it.',
  },
  {
    n: '02',
    t: 'Standalone BLAST+ on an AWS virtual machine',
    d: 'The second attempt installed the full BLAST+ suite on a rented virtual machine. It worked, and it proved the engine was the easy part — but it left a server to provision, patch and pay for whether or not anyone was searching, and it still needed a command line to drive it.',
  },
  {
    n: '03',
    t: 'A managed interface on Google Cloud',
    d: 'The third put the unmodified BLAST+ binaries and their databases inside a container image, ran it on managed infrastructure that scales with demand, and put a browser in front of it. No installation, no server to maintain, no command line — and the same engine underneath. This is the platform you are using.',
  },
];

const STEPS = [
  {
    n: '01',
    t: 'Choose the program first',
    d: 'The program decides which molecule your query has to be and which databases you can search. blastn, blastx and tblastx take a nucleotide query; blastp and tblastn take protein. Setting this before you upload saves a rejected file.',
  },
  {
    n: '02',
    t: 'Add your FASTA files',
    d: 'Drag in up to 100 files, 10 MB each and 50 MB per submission. Headers and residue alphabets are checked in the browser, so a malformed or wrong-molecule file is refused immediately with the reason — not halfway through a run.',
  },
  {
    n: '03',
    t: 'Set the search parameters',
    d: 'Pick a reference database of the right molecule, a search task, an E-value threshold and a hit limit. The defaults are sensible for identification work: megablast and E = 0.01.',
  },
  {
    n: '04',
    t: 'Read the results',
    d: 'Sort and filter by identity, coverage, E-value, bit score, organism or accession. Open any hit to see the pairwise alignment for each HSP with matches, mismatches and gaps marked.',
  },
  {
    n: '05',
    t: 'Export',
    d: 'A multi-sheet Excel workbook with one sheet per query, a landscape PDF report, or the raw JSON and CSV. Results stay in your history for one year.',
  },
];

const DATABASES = [
  ['drosophila', 'Drosophila melanogaster', 'GCF_000001215.4', 'RNA', '34,526', '92,449,215'],
  ['drosophila_genome', 'Drosophila melanogaster', 'GCF_000001215.4', 'Genomic DNA', '1,870', '143,726,002'],
  ['drosophila_protein', 'Drosophila melanogaster', 'GCF_000001215.4', 'Protein', '30,802', '20,379,498'],
  ['ecoli', 'Escherichia coli K-12 MG1655', 'GCF_000005845.2', 'Genomic DNA', '1', '4,641,652'],
  ['ecoli_protein', 'Escherichia coli K-12 MG1655', 'GCF_000005845.2', 'Protein', '4,300', '1,330,036'],
  ['yeast_genome', 'Saccharomyces cerevisiae S288C', 'GCF_000146045.2', 'Genomic DNA', '17', '12,157,105'],
  ['yeast', 'Saccharomyces cerevisiae S288C', 'GCF_000146045.2', 'RNA', '6,138', '8,873,817'],
  ['yeast_protein', 'Saccharomyces cerevisiae S288C', 'GCF_000146045.2', 'Protein', '6,021', '2,933,360'],
  ['sarscov2', 'SARS-CoV-2', 'NC_045512.2', 'Genomic RNA', '1', '29,903'],
  ['sarscov2_protein', 'SARS-CoV-2', 'GCF_009858895.2', 'Protein', '12', '14,149'],
  ['viruses', 'SARS-CoV-2 and HIV-1', 'NC_045512.2, NC_001802.1', 'Genomic RNA', '2', '39,084'],
];

const PROGRAMS = [
  ['blastn', 'Nucleotide', 'Nucleotide', 'None'],
  ['blastp', 'Protein', 'Protein', 'None'],
  ['blastx', 'Nucleotide', 'Protein', 'Query, six reading frames'],
  ['tblastn', 'Protein', 'Nucleotide', 'Database, six reading frames'],
  ['tblastx', 'Nucleotide', 'Nucleotide', 'Both, six reading frames each'],
];

const FUTURE = [
  {
    icon: I.Upload,
    t: 'Beyond one hundred files',
    d: 'The current per-submission limit is a deliberate bound on how long a single job can run, not a limit of the engine. Moving execution to a worker pool with a job queue would let a submission scale to thousands of sequences and make cancellation reliable across instances at the same time.',
  },
  {
    icon: I.Database,
    t: 'User-supplied databases',
    d: 'Every database here is pinned and pre-indexed, which is what makes results reproducible — but it means you cannot search your own reference set. Allowing an uploaded FASTA to be indexed per user, with the same provenance recording, is the most requested extension of the idea.',
  },
  {
    icon: I.Search,
    t: 'NCBI E-utilities integration',
    d: 'Retrieving records by accession through Entrez, and linking hits to the literature, was attempted during the earlier virtual-machine work and remains the natural next step. It would let a result move from "what is this sequence" to "what is already known about it" without leaving the page.',
  },
  {
    icon: I.Cloud,
    t: 'More reference organisms',
    d: 'The set covers four model organisms plus a viral pair. Larger assemblies — human GRCh38 among them — need more scratch space than the current deployment provides for indexing, which is a provisioning question rather than a design one.',
  },
];

export default function AboutPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const toast = useToast();

  async function signIn() {
    try {
      await signInWithGoogle();
    } catch (err) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      toast('Could not sign in', { tone: 'error', desc: 'Something went wrong reaching Google. Please try again.' });
    }
  }

  return (
    <>
      <header className="mk-nav">
        <div className="mk mk-nav-inner">
          <Link href="/" className="row g-3" style={{ textDecoration: 'none' }}>
            <span className="brand-mark"><I.Helix /></span>
            <span className="brand-word">Super<em>BLAST</em></span>
          </Link>
          {user ? (
            <Button as={Link} href="/dashboard" variant="primary" size="sm">
              Go to dashboard <I.ChevronRight />
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={signIn} disabled={loading}>
              <I.Google /> Sign in
            </Button>
          )}
        </div>
      </header>

      <main>
        {/* ── Header ── */}
        <section className="mk">
          <div className="mk-hero" style={{ paddingBottom: 'var(--s-8)' }}>
            <span className="mk-eyebrow"><I.Info /> About this platform</span>
            <h1 className="mk-title">Standalone BLAST+, <strong>without the command line.</strong></h1>
            <p className="mk-lede">
              SuperBLAST (also referred to as BLAST Hub) exists because the difficulty most
              biologists have with BLAST is not the alignment science. It is everything around
              it — getting a hundred sequences in, keeping each result attached to the file it
              came from, and getting the whole set back out in a form the next step can use.
            </p>
          </div>
        </section>

        {/* ── The problem ── */}
        <section className="mk mk-section" style={{ paddingTop: 0 }}>
          <div className="mk-section-head">
            <h2 className="mk-h2">The gap this fills</h2>
          </div>
          <div className="grid-2">
            <Card className="mk-feature">
              <span className="mk-feature-icon"><I.Cloud /></span>
              <h3>The public web service</h3>
              <p>
                Authoritative and free, but it takes one query at a time, queues behind everyone
                else, and limits file and sequence size. A folder of a hundred reads means a
                hundred submissions and a hundred result pages to reconcile by hand.
              </p>
            </Card>
            <Card className="mk-feature">
              <span className="mk-feature-icon"><I.Beaker /></span>
              <h3>Standalone BLAST+</h3>
              <p>
                No queue and no limits, but it asks the researcher to install the suite, build
                databases with <code>makeblastdb</code>, and write a script to loop over files.
                That is a fair amount of command-line competence to demand of someone whose
                expertise is at the bench.
              </p>
            </Card>
          </div>
          <div className="prose" style={{ marginTop: 'var(--s-6)' }}>
            <p>
              Both routes fail the same person, and they fail for the same reason: the obstacle
              is data handling, not computation. SuperBLAST runs the genuine, unmodified BLAST+
              binaries on managed infrastructure and returns one organised result set per
              submission. It is a front end to BLAST+ — <strong>not a reimplementation, and not a
              queue in front of the public NCBI service</strong>.
            </p>
          </div>
        </section>

        {/* ── Approach ── */}
        <section className="mk mk-section" style={{ paddingTop: 0 }}>
          <div className="mk-section-head">
            <h2 className="mk-h2">How it was built</h2>
            <p className="mk-lede" style={{ fontSize: 'var(--t-md)' }}>
              Three approaches were developed and compared. The third is the one that worked.
            </p>
          </div>
          <div className="mk-flow">
            {APPROACHES.map((a) => (
              <Card key={a.n} className="mk-flow-step">
                <span className="mk-flow-n">{a.n}</span>
                <h3>{a.t}</h3>
                <p>{a.d}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* ── Usage ── */}
        <section className="mk mk-section" style={{ paddingTop: 0 }}>
          <div className="mk-section-head">
            <h2 className="mk-h2">Using it</h2>
          </div>
          <div className="mk-flow">
            {STEPS.map((s) => (
              <Card key={s.n} className="mk-flow-step">
                <span className="mk-flow-n">{s.n}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </Card>
            ))}
          </div>

          <div className="about-table-wrap" style={{ marginTop: 'var(--s-6)' }}>
            <table className="about-table">
              <caption>The five search programs, and the molecule each requires.</caption>
              <thead>
                <tr><th>Program</th><th>Query</th><th>Database</th><th>Translation applied</th></tr>
              </thead>
              <tbody>
                {PROGRAMS.map((r) => (
                  <tr key={r[0]}>
                    <td className="mono">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Databases ── */}
        <section className="mk mk-section" style={{ paddingTop: 0 }}>
          <div className="mk-section-head">
            <h2 className="mk-h2">Reference databases</h2>
            <p className="mk-lede" style={{ fontSize: 'var(--t-md)' }}>
              Every figure below was measured by <code>blastdbcmd -info</code> inside the
              production image. None of it is estimated.
            </p>
          </div>

          <div className="about-table-wrap">
            <table className="about-table">
              <caption>
                Nucleotide and protein sets are provided for each organism, so every program has a
                compatible target. Letters are bases for nucleotide databases, residues for protein.
              </caption>
              <thead>
                <tr>
                  <th>Database</th><th>Organism</th><th>Assembly</th>
                  <th>Molecule</th><th>Sequences</th><th>Letters</th>
                </tr>
              </thead>
              <tbody>
                {DATABASES.map((r) => (
                  <tr key={r[0]}>
                    <td className="mono">{r[0]}</td>
                    <td><em>{r[1]}</em></td>
                    <td className="mono">{r[2]}</td>
                    <td>{r[3]}</td>
                    <td className="mono">{r[4]}</td>
                    <td className="mono">{r[5]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="prose" style={{ marginTop: 'var(--s-5)' }}>
            <p>
              Each database is built with <code>makeblastdb -dbtype {'{nucl|prot}'} -parse_seqids
              -taxid</code> and the image carries NCBI&rsquo;s taxonomy tables, so every hit resolves
              to a scientific name and a taxonomy identifier. The source URL, SHA-256 checksum,
              record count and index size are recorded inside the image for every database. The
              build <strong>fails</strong> if any database cannot be opened by
              <code>blastdbcmd</code> or does not resolve an organism name, and one search per
              program is run before the image ships — so a database that cannot be opened or
              searched cannot reach production.
            </p>
          </div>
        </section>

        {/* ── Validation ── */}
        <section className="mk mk-section" style={{ paddingTop: 0 }}>
          <div className="mk-section-head">
            <h2 className="mk-h2">How accuracy is checked</h2>
          </div>
          <div className="prose">
            <p>
              Every validation query is extracted from the database under test using
              <code>blastdbcmd</code>, so no sequence is invented and each expected result is
              independently checkable.
            </p>
            <ul>
              <li>
                <strong>Positive controls.</strong> A 600-base region of <em>D. melanogaster</em>
                chromosome 3R returns 100.000% identity over 600/600 positions, zero gaps,
                E&nbsp;=&nbsp;0.0 at 1109 bits. The SARS-CoV-2 spike region behaves the same way.
              </li>
              <li>
                <strong>Negative controls.</strong> A SARS-CoV-2 fragment searched against the
                <em>D. melanogaster</em> genome returns no hits at E&nbsp;&lt;&nbsp;1e-5, and an
                <em>E. coli</em> fragment against SARS-CoV-2 likewise.
              </li>
              <li>
                <strong>A biological check.</strong> An <em>E. coli</em> 16S rRNA sequence searched
                against the <em>E. coli</em> genome returns exactly seven hits, at the chromosomal
                coordinates of the seven <em>rrn</em> operons, with <em>rrnG</em> and <em>rrnD</em>
                correctly reported on the minus strand. Seven is the number the biology predicts,
                and it is the strongest single piece of evidence that the pipeline is behaving.
              </li>
              <li>
                <strong>Structural checks.</strong> A script in the repository asserts the JSON-15
                structure and independently recomputes identity, coverage and gap openings from the
                alignment strings rather than trusting the reported fields.
              </li>
            </ul>
          </div>
        </section>

        {/* ── Honest limits ── */}
        <section className="mk mk-section" style={{ paddingTop: 0 }}>
          <div className="mk-section-head">
            <h2 className="mk-h2">What it does not do</h2>
            <p className="mk-lede" style={{ fontSize: 'var(--t-md)' }}>
              Stated plainly rather than buried, because knowing the boundary is part of using a
              tool correctly.
            </p>
          </div>
          <div className="prose">
            <ul>
              <li>
                <strong>The AI interpretation is not reproducible.</strong> Generation is
                non-deterministic and the model is a moving alias the provider repoints without
                notice. It has not been evaluated against expert annotation. Treat it as an
                exploratory aid, verify every claim against the alignments, and do not cite it.
                The BLAST results themselves <em>are</em> reproducible — engine version, assembly
                accessions and checksums are all pinned.
              </li>
              <li>
                <strong>There is no published benchmark</strong> against standalone BLAST+ or the
                NCBI web service on this version.
              </li>
              <li>
                <strong>The human GRCh38 database is disabled.</strong> Indexing it needs more
                scratch space than the deployment provides, so it is reported as unavailable with
                that reason rather than offered and failing.
              </li>
              <li>
                <strong>Databases are a fixed set.</strong> You cannot yet supply your own.
              </li>
              <li>
                <strong>Cancellation is best-effort</strong> when a search is running on a
                different server instance from the one receiving the request. The response says so
                explicitly rather than claiming a process was terminated when it was not.
              </li>
              <li>
                <strong>Results are kept for one year</strong> and then removed automatically.
                Export anything you need to keep.
              </li>
            </ul>
          </div>
        </section>

        {/* ── Future scope ── */}
        <section className="mk mk-section" style={{ paddingTop: 0 }}>
          <div className="mk-section-head">
            <h2 className="mk-h2">Where this goes next</h2>
            <p className="mk-lede" style={{ fontSize: 'var(--t-md)' }}>
              This is a working prototype that validates an approach, not a finished product. The
              boundaries above are scope, not oversights — and each one points at a direction.
            </p>
          </div>
          <div className="mk-features">
            {FUTURE.map((f) => (
              <Card key={f.t} className="mk-feature">
                <span className="mk-feature-icon"><f.icon /></span>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* ── Citing ── */}
        <section className="mk mk-section" style={{ paddingTop: 0 }}>
          <div className="mk-section-head">
            <h2 className="mk-h2">Citing this work</h2>
            <p className="mk-lede" style={{ fontSize: 'var(--t-md)' }}>
              If SuperBLAST contributed to work you publish, please cite all three: the platform,
              the engine it runs, and the reference assemblies you searched against.
            </p>
          </div>

          <div className="stack g-4">
            <Card pad="lg" className="stack g-3">
              <div className="card-title">The platform</div>
              <p className="cite">
                Vipin. SuperBLAST (BLAST Hub): bulk sequence search on managed NCBI BLAST+
                infrastructure. Zenodo. <a href={`https://doi.org/${CONCEPT_DOI}`} target="_blank" rel="noopener noreferrer">https://doi.org/{CONCEPT_DOI}</a>
              </p>
              <p className="t-sm muted">
                This is the concept DOI and always resolves to the most recent archived version.
                Machine-readable metadata is in <code>CITATION.cff</code> in the repository.
                ORCID <span className="mono">{ORCID}</span>.
              </p>
            </Card>

            <Card pad="lg" className="stack g-3">
              <div className="card-title">The search engine</div>
              <p className="cite">
                Camacho C, Coulouris G, Avagyan V, Ma N, Papadopoulos J, Bealer K, Madden TL.
                BLAST+: architecture and applications. <em>BMC Bioinformatics</em> 2009;10:421.{' '}
                <a href="https://doi.org/10.1186/1471-2105-10-421" target="_blank" rel="noopener noreferrer">
                  https://doi.org/10.1186/1471-2105-10-421
                </a>
              </p>
              <p className="t-sm muted">
                SuperBLAST orchestrates NCBI BLAST+ 2.17.0 without modifying it. The algorithm and
                the statistics are theirs, and the original BLAST papers of Altschul and colleagues
                (1990, 1997) should be cited where you describe the method itself.
              </p>
            </Card>

            <Card pad="lg" className="stack g-3">
              <div className="card-title">The reference data</div>
              <p className="t-sm muted">
                All sequence data comes from NCBI RefSeq. Cite the assembly accession for each
                database you searched — they are listed in the table above, and the full source
                URLs and SHA-256 checksums are recorded in <code>docs/DATABASES.md</code> in the
                repository. Many journals ask that datasets be tagged <code>[dataset]</code> in the
                reference list.
              </p>
            </Card>
          </div>
        </section>

        {/* ── Colophon ── */}
        <section className="mk mk-section" style={{ paddingTop: 0 }}>
          <div className="grid-2">
            <Card className="mk-feature">
              <span className="mk-feature-icon"><I.Github /></span>
              <h3>Open source</h3>
              <p>
                The complete source is public under the MIT licence, including the container
                definitions, the database build scripts and the validation harness. Every release
                is archived on Zenodo with a permanent DOI.
              </p>
              <p style={{ marginTop: 'var(--s-3)' }}>
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                  github.com/vipin839/superblast <I.External />
                </a>
              </p>
            </Card>
            <Card className="mk-feature">
              <span className="mk-feature-icon"><I.Beaker /></span>
              <h3>Origin and acknowledgements</h3>
              <p>
                This work began as an MSc dissertation in Biotechnology at Guru Jambheshwar
                University of Science and Technology, Hisar, supervised by Dr. Sapna Grewal.
              </p>
              <p style={{ marginTop: 'var(--s-3)' }}>
                Built on NCBI BLAST+, a United States Government Work in the public domain.
                BLAST&reg; is a registered trademark of the National Library of Medicine.
                Reference data from NCBI RefSeq remains subject to NCBI&rsquo;s data usage policies.
              </p>
            </Card>
          </div>
        </section>

        <section className="mk mk-section" style={{ paddingTop: 0 }}>
          <div className="card-inv mk-cta-band">
            <h2 className="mk-h2" style={{ color: 'var(--fg-inv)' }}>Try it on your own sequences</h2>
            <p style={{ color: 'var(--fg-inv-2)', maxWidth: '52ch' }}>
              There is nothing to install and no cluster to provision.
            </p>
            {user ? (
              <Button as={Link} href="/search" variant="primary" size="lg">
                New search <I.ChevronRight />
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={signIn} disabled={loading}>
                <I.Google /> Start analysing
              </Button>
            )}
          </div>
        </section>
      </main>

      <footer className="mk-foot">
        <div className="mk mk-foot-inner">
          <div className="stack g-2">
            <div className="row g-3">
              <span className="brand-mark"><I.Helix /></span>
              <span className="brand-word">Super<em>BLAST</em></span>
            </div>
            <p className="mk-legal">
              Built on NCBI BLAST+ and Google Cloud Platform.<br />
              BLAST&reg; is a registered trademark of the National Library of Medicine.
            </p>
          </div>
          <div className="mk-foot-links">
            <Link className="mk-foot-link" href="/"><I.ChevronLeft /> Home</Link>
            <a className="mk-foot-link" href={`mailto:${CONTACT_EMAIL}`}><I.Mail /> {CONTACT_EMAIL}</a>
            <a className="mk-foot-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">
              <I.Github /> GitHub
            </a>
            <a className="mk-foot-link" href={`https://doi.org/${CONCEPT_DOI}`} target="_blank" rel="noopener noreferrer">
              <I.Doc /> DOI
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
