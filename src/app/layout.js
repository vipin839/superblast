import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';
import { ToastProvider } from '@/components/ui';
import ThemeSync from '@/components/ThemeSync';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'BLASTHub — Cloud Sequence Analysis',
  description:
    'Run bulk nucleotide BLAST searches on managed NCBI BLAST+ infrastructure. Upload up to 100 FASTA files, explore alignments interactively, and export publication-ready reports.',
  keywords: 'BLAST, bioinformatics, nucleotide, sequence alignment, NCBI, FASTA, genomics',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#E8E9EB' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0C0D' },
  ],
};

export default function RootLayout({ children }) {
  return (
    // ThemeSync stamps data-theme after hydration, so the attribute can differ
    // from the server markup by design.
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeSync />
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
