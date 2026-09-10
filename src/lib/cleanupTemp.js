import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // Run sweep every 15 minutes

let cleanupIntervalId = null;

/**
 * Delete files in a directory older than maxAgeMs
 * @param {string} directory - Directory to clean
 * @param {number} maxAgeMs - Max file age in milliseconds
 * @returns {object} { deleted, errors, skipped }
 */
export async function cleanupOldFiles(directory, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const stats = { deleted: 0, errors: 0, skipped: 0 };

  try {
    const files = await fs.readdir(directory);
    const now = Date.now();

    for (const file of files) {
      // Only the transient files BLAST+ needs. `final_`/`error_` are legacy:
      // completed results now live in Cloud Storage, not on this filesystem.
      // They stay in the pattern so that any left over from an older revision
      // are still swept up.
      if (!file.match(/^(query_|out_|diag_|probe_|final_|error_)/)) {
        stats.skipped++;
        continue;
      }

      const filePath = path.join(directory, file);

      try {
        const fileStat = await fs.stat(filePath);
        const age = now - fileStat.mtimeMs;

        if (age > maxAgeMs) {
          await fs.unlink(filePath);
          stats.deleted++;
        } else {
          stats.skipped++;
        }
      } catch (err) {
        stats.errors++;
      }
    }
  } catch (err) {
    // Directory doesn't exist or can't be read — not an error worth crashing for
    if (err.code !== 'ENOENT') {
      console.error('Cleanup sweep error:', err.message);
    }
  }

  return stats;
}

/**
 * Clean up specific files immediately (for post-BLAST cleanup)
 * @param {string[]} files - Array of file paths to delete
 */
export async function cleanupFiles(...files) {
  await Promise.all(
    files.map(f => fs.unlink(f).catch(() => {}))
  );
}

/**
 * Get the temp directory path
 */
export function getTempDir() {
  return process.env.NODE_ENV === 'production' ? '/app/temp_queries' : os.tmpdir();
}

/**
 * Start a periodic cleanup sweep (singleton — safe to call multiple times)
 */
export function startPeriodicCleanup() {
  if (cleanupIntervalId) return; // Already running

  const tempDir = getTempDir();

  cleanupIntervalId = setInterval(async () => {
    const result = await cleanupOldFiles(tempDir);
    if (result.deleted > 0) {
      console.log(`[Cleanup] Removed ${result.deleted} temp files older than 1 hour`);
    }
  }, CLEANUP_INTERVAL_MS);

  // Don't block process exit
  if (cleanupIntervalId.unref) {
    cleanupIntervalId.unref();
  }

  // Run one sweep immediately on startup
  cleanupOldFiles(tempDir).then(result => {
    if (result.deleted > 0) {
      console.log(`[Cleanup] Initial sweep: removed ${result.deleted} old temp files`);
    }
  });
}
