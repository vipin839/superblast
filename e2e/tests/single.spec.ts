import { test, expect } from '@playwright/test';
import path from 'path';

test('single job submit and download', async ({ page }) => {
  // go to app
  await page.goto('/');

  // attach local test FASTA included in repo
  const filePath = path.resolve(process.cwd(), 'backend', 'test_seq.fasta');
  const input = page.locator('input[type=file]');
  await input.setInputFiles(filePath);

  // submit job
  await page.click('text=Submit Job');
  await page.waitForURL('**/jobs', { timeout: 30000 });

  // open first job details
  await page.click('table tbody tr:first-child a');

  // trigger download and wait for download_all response
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/download_all') && r.status() === 200, { timeout: 30000 }),
    page.click('text=Download All Results'),
  ]);

  const buf = await resp.body();
  expect(buf.length).toBeGreaterThan(0);
});
