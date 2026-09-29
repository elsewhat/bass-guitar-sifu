import { expect, test, type Page } from '@playwright/test';

async function stripX(page: Page) {
  const transform = await page.getByTestId('strip-host').evaluate((el) => (el as HTMLElement).style.transform);
  return Number(/translate3d\(([-\d.]+)px/.exec(transform)?.[1]);
}

/** White-ringed circles of the current tab note (the chord has one per string). */
function currentRings(page: Page) {
  return page.getByTestId('strip-host').locator('circle[stroke="#ffffff"]');
}

async function openSong(page: Page, slug = 'vortex-surfer') {
  await page.goto(`./?song=${slug}`);
  // The strip is ready once alphaTab has rendered and the overlays are placed.
  await expect(page.getByText('Loading notation…')).toBeHidden({ timeout: 20_000 });
}

test('practice layout fills 1440×900 without scrolling', async ({ page }) => {
  await openSong(page);
  await expect(page.getByRole('navigation', { name: 'Practice plan' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Video' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible();

  const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
  expect(scroll).toEqual([1440, 900]);
});

test('collapsing the practice plan widens the video cell', async ({ page }) => {
  await openSong(page);
  const video = page.getByRole('region', { name: 'Video' });
  expect((await video.boundingBox())?.width).toBe(619);
  await page.getByRole('button', { name: 'Hide practice plan' }).click();
  expect((await video.boundingBox())?.width).toBe(711);
  await expect(page.getByRole('button', { name: 'Chunk 3, Climb, bars 142–147' })).toBeVisible();
});

test('fits a 1280 px wide window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSong(page);
  const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
  expect(scroll).toEqual([1280, 800]);
});

test('loads Vortex Surfer with its practice plan, strip and fingering', async ({ page }) => {
  await openSong(page);
  await expect(page.getByRole('heading', { name: 'Vortex Surfer' })).toBeVisible();
  await expect(page.getByText('110 BPM · 4/4 · Standard E A D G · 243 bars')).toBeVisible();
  await expect(page.getByText('Bars 1–129 · bass rests')).toBeVisible();
  await expect(page.getByText('Intro skipped · bass rests bars 1–129')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chunk 1, Riff A, bars 130–133' })).toHaveAttribute('aria-current', 'step');
  // Riff A starts on B♭ re-tabbed to E6 with the little finger.
  await expect(page.getByTestId('now-fret')).toHaveText('6');
  await expect(page.getByLabel('Next', { exact: true })).toContainText('in 8');
  await expect(page.getByText('Loop · chunk 1 · Riff A · bars 130–133 · pass 1 of 3')).toBeVisible();
  await expect(page.getByText('Retab · source A1').first()).toBeAttached();
  await expect(currentRings(page)).toHaveCount(1);
});

test('Count playback scrolls the strip and the tempo control steps by 5 %', async ({ page }) => {
  await openSong(page);
  const before = await stripX(page);
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await stripX(page)).toBeLessThan(before - 50);
  await page.getByRole('button', { name: 'Pause' }).click();

  await page.getByRole('button', { name: 'Faster' }).click();
  await expect(page.getByTestId('tempo')).toHaveText('80%');
  await expect(page.getByText('88 BPM')).toBeVisible();
});

test('Synth loads on demand, scrolls the strip and hands its position to Count', async ({ page }) => {
  const soundfont: string[] = [];
  page.on('request', (r) => r.url().includes('soundfont/') && soundfont.push(r.url()));
  await openSong(page);
  expect(soundfont).toEqual([]); // nothing loads until the Synth is chosen

  const video = page.getByRole('region', { name: 'Video' });
  await page.getByRole('button', { name: 'Synth' }).click();
  await expect(video).toHaveAttribute('data-source-status', 'ready', { timeout: 20_000 });
  await expect(video.getByText('Rendered from the score · any tempo')).toBeVisible();
  expect(soundfont).toHaveLength(1);

  const before = await stripX(page);
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(1500);
  expect(await stripX(page)).toBeLessThan(before - 50);
  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await stripX(page);

  await page.getByRole('button', { name: 'Count' }).click();
  await expect(video.getByText('Audio count')).toBeVisible();
  expect(Math.abs((await stripX(page)) - paused)).toBeLessThan(2);
});

test('"Next chunk" and the practice plan select chunks', async ({ page }) => {
  await openSong(page);
  await page.getByRole('button', { name: 'Next chunk', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Chunk 2, Riff A ×2, bars 134–141' })).toHaveAttribute('aria-current', 'step');
  await page.getByRole('button', { name: 'Chunk 5, Descent, bars 160–176' }).click();
  await expect(page.getByText('Bars 160–176 · pass 1 of 3', { exact: true })).toBeVisible();
  await expect(page.getByText('Loop 5:46–6:24 · score time')).toBeVisible();
});

test('switches to Killing in the Name through the song list and ?song=', async ({ page }) => {
  await openSong(page);
  await page.getByRole('button', { name: 'Songs' }).click();
  await page.getByRole('option', { name: /Killing in the Name/ }).click();
  await expect(page.getByRole('heading', { name: 'Killing in the Name' })).toBeVisible();
  await expect(page).toHaveURL(/song=killing-in-the-name/);
  await expect(page.getByText('109 BPM · mixed meter · Drop D D A D G · 120 bars')).toBeVisible();
  await expect(page.getByText('Loading notation…')).toBeHidden({ timeout: 20_000 });

  await openSong(page, 'killing-in-the-name');
  await expect(page.getByRole('heading', { name: 'Killing in the Name' })).toBeVisible();
  await expect(currentRings(page)).toHaveCount(4); // bar 1: D5 chord with the open D
});

test('notes are inside the playhead band when plucked, with four notes to its left', async ({ page }) => {
  await openSong(page);
  for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'Faster' }).click(); // 120 %: crosses barlines sooner
  await page.getByRole('button', { name: 'Play' }).click();
  const { offsets, leftCounts } = await page.evaluate(async () => {
    const band = document.querySelector('[data-testid=playhead]')!.getBoundingClientRect();
    const centre = band.left + band.width / 2;
    const host = document.querySelector('[data-testid=strip-host]')!;
    const clipLeft = host.parentElement!.getBoundingClientRect().left;
    const offsets: number[] = [];
    const leftCounts: number[] = [];
    let last = '';
    const t0 = performance.now();
    await new Promise<void>((done) => {
      (function frame() {
        const rings = [...host.querySelectorAll('circle[stroke="#ffffff"]')];
        const key = rings.map((r) => r.getAttribute('cx')).join();
        if (rings.length && key !== last) {
          last = key;
          const r = rings[0]!.getBoundingClientRect();
          offsets.push(Math.round(r.left + r.width / 2 - centre));
          leftCounts.push(
            [...host.querySelectorAll('circle[r="10"]')].filter((c) => {
              const b = c.getBoundingClientRect();
              return b.left + b.width / 2 > clipLeft && b.right < band.left;
            }).length,
          );
        }
        if (performance.now() - t0 < 5000) requestAnimationFrame(frame);
        else done();
      })();
    });
    return { offsets, leftCounts };
  });
  expect(offsets.length).toBeGreaterThan(20);
  for (const o of offsets) expect(Math.abs(o)).toBeLessThanOrEqual(15);
  // Four eighth notes to the left; three just after a barline, whose extra gap takes the room.
  const settled = leftCounts.slice(6);
  expect(settled.every((n) => n === 3 || n === 4)).toBe(true);
  expect(settled.filter((n) => n === 4).length).toBeGreaterThan(settled.length / 2);
});
