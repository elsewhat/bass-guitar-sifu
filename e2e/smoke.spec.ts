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
  await expect(page.locator('header').getByRole('button', { name: 'Full screen' })).toBeVisible();

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
  // The album cover replaces the placeholder (ADR-0026).
  await expect(page.getByRole('img', { name: 'Trust Us cover' })).toHaveJSProperty('naturalWidth', 300);
  await expect(page.getByText('110 BPM · 4/4 · Standard E A D G · 243 bars')).toBeVisible();
  await expect(page.getByText('Bars 1–129 · bass rests')).toBeVisible();
  await expect(page.getByText('Intro skipped · bass rests bars 1–129')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chunk 1, Riff A, bars 130–133' })).toHaveAttribute('aria-current', 'step');
  // Riff A starts on B♭ at A1 as tabbed, with the index finger (ADR-0007 beginner rules).
  await expect(page.getByTestId('now-fret')).toHaveText('1');
  await expect(page.getByLabel('Next', { exact: true })).toContainText('in 8');
  await expect(page.getByText('Loop · chunk 1 · Riff A · bars 130–133 · play through')).toBeVisible();
  await expect(page.getByText('Retab · source E7').first()).toBeAttached(); // bar 169
  await expect(currentRings(page)).toHaveCount(1);
});

test('Count playback scrolls the strip and the tempo control steps by 5 % up to 100 %', async ({ page }) => {
  await openSong(page);
  const before = await stripX(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(() => stripX(page), { timeout: 10_000 }).toBeLessThan(before - 50); // after the count-in (ADR-0025)
  await page.getByRole('button', { name: 'Pause' }).click();

  await expect(page.getByTestId('tempo')).toHaveText('100%');
  await expect(page.getByRole('button', { name: 'Faster' })).toBeDisabled();
  await page.getByRole('button', { name: 'Slower' }).click();
  await expect(page.getByTestId('tempo')).toHaveText('95%');
  await expect(page.getByText('105 BPM')).toBeVisible();
});

test('Play and a chunk change while playing count in one bar first (ADR-0025)', async ({ page }) => {
  await openSong(page);
  const cells = page.getByTestId('count-cells');
  const before = await stripX(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(cells).toHaveAttribute('data-count-in', 'true');
  expect(Math.abs((await stripX(page)) - before)).toBeLessThan(2); // the strip waits for the count-in
  await expect(cells).toHaveAttribute('data-count-in', 'false'); // one bar at 110 bpm: 2.2 s
  await expect.poll(() => stripX(page)).toBeLessThan(before - 20);

  await page.getByRole('button', { name: 'Next chunk', exact: true }).click();
  await expect(cells).toHaveAttribute('data-count-in', 'true');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(cells).toHaveAttribute('data-count-in', 'false'); // pausing cancels the count-in
});

test('Synth loads on demand, scrolls the strip and hands its position to the Metronome', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => stripX(page), { timeout: 10_000 }).toBeLessThan(before - 50); // after the count-in (ADR-0025)
  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await stripX(page);

  await page.getByRole('button', { name: 'Metronome' }).click();
  await expect(video.getByText('Audio count')).toBeVisible();
  expect(Math.abs((await stripX(page)) - paused)).toBeLessThan(2);
});

test('Music plays the rendered MP3 at full speed only and hands its position to the Metronome', async ({ page }) => {
  await openSong(page, 'killing-in-the-name');
  const video = page.getByRole('region', { name: 'Video' });
  await page.getByRole('button', { name: 'Slower' }).click();
  await expect(page.getByTestId('tempo')).toHaveText('95%');

  await page.getByRole('button', { name: 'Music', exact: true }).click();
  await expect(video).toHaveAttribute('data-source-status', 'ready', { timeout: 20_000 });
  await expect(video.getByText('Rendered from the score · full speed only')).toBeVisible();
  await expect(page.getByTestId('tempo')).toHaveText('100%'); // locked while Music plays
  await expect(page.getByRole('button', { name: 'Slower' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Faster' })).toBeDisabled();

  const before = await stripX(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  // Bars 1–4 are whole-note chords, engraved narrow: the strip moves about 50 px in 5 s after the count-in.
  await expect.poll(() => stripX(page), { timeout: 10_000 }).toBeLessThan(before - 20);
  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await stripX(page);

  await page.getByRole('button', { name: 'Metronome' }).click();
  await expect(video.getByText('Audio count')).toBeVisible();
  expect(Math.abs((await stripX(page)) - paused)).toBeLessThan(2);
  await expect(page.getByTestId('tempo')).toHaveText('95%'); // the chosen tempo is back
});

test('Music is disabled for a song without a rendered MP3', async ({ page }) => {
  await openSong(page);
  await expect(page.getByRole('button', { name: 'Music', exact: true })).toBeDisabled();
});

test('the repeat button cycles play through, loop and advance', async ({ page }) => {
  await openSong(page);
  const counter = page.getByTestId('pass-counter');
  const current = page.getByRole('button', { name: 'Chunk 1, Riff A, bars 130–133' });
  await expect(counter).toHaveText('Play through'); // the default
  await expect(current).toContainText('Bars 130–133 · play through');
  await page.getByRole('button', { name: /^Play through: each chunk once/ }).click();
  await expect(counter).toHaveText('Pass 1');
  await expect(current).toContainText('pass 1 · looping');
  await page.getByRole('button', { name: /^Loop this chunk until you move on/ }).click();
  await expect(counter).toHaveText('1/3');
  await expect(page.getByText('Loop · chunk 1 · Riff A · bars 130–133 · pass 1 of 3')).toBeVisible();

  await page.reload(); // the mode is kept in the browser
  await expect(page.getByTestId('pass-counter')).toHaveText('1/3');
  await page.getByRole('button', { name: /^Repeat each chunk 3 times/ }).click();
  await expect(page.getByTestId('pass-counter')).toHaveText('Play through');
});

test('the mixer sets master, Metronome and Synth track channels and keeps them', async ({ page }) => {
  await openSong(page);
  await page.getByRole('button', { name: 'Mixer' }).click();
  const mixer = page.getByRole('dialog', { name: 'Mixer' });
  await expect(mixer).toBeVisible();
  await expect(mixer.getByRole('tab', { name: 'Metronome' })).toHaveAttribute('aria-selected', 'true'); // the active source
  await expect(mixer.getByTestId('channel-click')).toContainText('70%');
  await expect(mixer.getByTestId('channel-voice')).toContainText('No samples');
  await expect(mixer.getByLabel('voice volume')).toBeDisabled();
  await mixer.getByLabel('master volume').fill('50');
  await expect(mixer.getByTestId('channel-master')).toContainText('50%');
  await mixer.getByRole('button', { name: 'Mute click' }).click();
  await expect(mixer.getByTestId('channel-click')).toContainText('Muted');

  await mixer.getByRole('tab', { name: 'Synth' }).click();
  await expect(mixer.getByTestId('channel-Electric Bass (finger)')).toContainText('Your part');
  await expect(mixer.getByRole('button', { name: 'Bass only' })).toHaveAttribute('aria-pressed', 'true');
  await expect(mixer.getByTestId('channel-Drums')).toContainText('Off');
  await mixer.getByRole('button', { name: 'Full band' }).click();
  await expect(mixer.getByTestId('channel-Drums')).toContainText('80%');
  await mixer.getByRole('button', { name: 'Mute Electric Bass (finger)' }).click();
  await expect(mixer.getByRole('button', { name: 'Backing' })).toHaveAttribute('aria-pressed', 'true');
  await mixer.getByRole('button', { name: 'Solo Drums' }).click();
  await expect(mixer.getByTestId('channel-Distortion Guitar')).toContainText('Off');
  await expect(mixer.getByRole('button', { name: 'Backing' })).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('Escape');
  await expect(mixer).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'Mixer' }).click();
  await expect(mixer.getByTestId('channel-master')).toContainText('50%');
  await expect(mixer.getByTestId('channel-click')).toContainText('Muted');
  await mixer.getByRole('tab', { name: 'Synth' }).click();
  await expect(mixer.getByRole('button', { name: 'Unsolo Drums' })).toBeVisible();
  await page.getByRole('button', { name: 'Close mixer' }).click({ position: { x: 20, y: 20 } }); // the backdrop
  await expect(mixer).toBeHidden();
});

test('"Next chunk" and the practice plan select chunks', async ({ page }) => {
  await openSong(page);
  await page.getByRole('button', { name: 'Next chunk', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Chunk 2, Riff A ×2, bars 134–141' })).toHaveAttribute('aria-current', 'step');
  await page.getByRole('button', { name: 'Chunk 5, Descent, bars 160–176' }).click();
  await expect(page.getByText('Bars 160–176 · play through', { exact: true })).toBeVisible();
  await expect(page.getByText('Loop 5:46–6:24 · score time')).toBeVisible();
});

test('keyboard: Space plays and pauses, arrows change chunk, + and − change tempo', async ({ page }) => {
  await openSong(page);
  const chunk = (name: string) => page.getByRole('button', { name });
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(chunk('Chunk 2, Riff A ×2, bars 134–141')).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('ArrowLeft');
  await expect(chunk('Chunk 1, Riff A, bars 130–133')).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('-');
  await expect(page.getByTestId('tempo')).toHaveText('95%');
  await page.keyboard.press('+');
  await expect(page.getByTestId('tempo')).toHaveText('100%');

  // Space on a focused button still means play/pause, not a click on that button.
  await page.getByRole('button', { name: 'Next chunk', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(chunk('Chunk 1, Riff A, bars 130–133')).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('Space');

  // Off while the song library is open: typing in the search does not drive the transport.
  await page.keyboard.press('Control+k');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type(' -');
  await page.keyboard.press('Escape');
  await expect(chunk('Chunk 1, Riff A, bars 130–133')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('tempo')).toHaveText('100%');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('song library: search, artist chips, Esc, Ctrl K and progress', async ({ page }) => {
  await openSong(page);
  await page.getByRole('button', { name: 'Next chunk', exact: true }).click(); // progress: chunk 2
  await page.getByRole('button', { name: 'Songs' }).click();
  const library = page.getByRole('dialog', { name: 'Song library' });
  await expect(library).toBeVisible();
  await expect(library.getByRole('searchbox', { name: 'Search songs' })).toBeFocused();
  const current = library.locator('button[aria-current=true]');
  await expect(current).toContainText('Vortex Surfer');
  await expect(current).toContainText('Playing · Chunk 2 of 9');
  const total = await library.locator('.grid > button').count();
  await expect(library.getByText(`${total} songs`)).toBeVisible();

  await library.getByRole('button', { name: /^Motorpsycho \(\d+\)$/ }).click();
  await expect(library.getByRole('button', { name: /^Creep/ })).toBeHidden();
  await library.getByRole('button', { name: /^Motorpsycho/ }).click(); // clicking the active chip clears it
  await expect(library.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

  await library.getByRole('searchbox').fill('wheel');
  await expect(library.getByText(`1 of ${total} songs`)).toBeVisible();
  await expect(library.getByRole('button', { name: /^The Wheel/ })).toContainText('C♯ standard');

  await page.keyboard.press('Escape');
  await expect(library).toBeHidden();
  await page.keyboard.press('Control+k');
  await expect(library).toBeVisible();
  await expect(library.getByRole('searchbox')).toHaveValue('');
  await library.getByRole('button', { name: /^Creep/ }).click();
  await expect(library).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Creep' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Pablo Honey cover' })).toHaveJSProperty('naturalWidth', 300);

  // Vortex Surfer's progress is kept and shown on its card, and restored when it is chosen again.
  await page.keyboard.press('Control+k');
  await expect(library.getByRole('button', { name: /^Vortex Surfer/ })).toContainText('Chunk 2 of 9');
  await library.getByRole('button', { name: /^Vortex Surfer/ }).click();
  await expect(page.getByRole('button', { name: 'Chunk 2, Riff A ×2, bars 134–141' })).toHaveAttribute('aria-current', 'step');
});

test('switches to Killing in the Name through the song library and ?song=', async ({ page }) => {
  await openSong(page);
  await page.getByRole('button', { name: 'Songs' }).click();
  await page.getByRole('dialog', { name: 'Song library' }).getByRole('button', { name: /^Killing in the Name/ }).click();
  await expect(page.getByRole('heading', { name: 'Killing in the Name' })).toBeVisible();
  await expect(page).toHaveURL(/song=killing-in-the-name/);
  await expect(page.getByText('109 BPM · mixed meter · Drop D D A D G · 120 bars')).toBeVisible();
  await expect(page.getByText('Loading notation…')).toBeHidden({ timeout: 20_000 });

  await openSong(page, 'killing-in-the-name');
  await expect(page.getByRole('heading', { name: 'Killing in the Name' })).toBeVisible();
  await expect(currentRings(page)).toHaveCount(4); // bar 1: D5 chord with the open D
  // The Now square shows the chord as tab rows, highest string on top.
  await expect(page.getByTestId('now-notes').locator('div')).toHaveText(['7', '7', '5', '0']);
  await expect(page.getByLabel('Now', { exact: true })).toContainText('Now · D5');
});

test('a score with repeats plays in played bars (Freedom, ADR-0023)', async ({ page }) => {
  await openSong(page, 'freedom');
  await expect(page.getByText('72 BPM · mixed meter · Drop D D A D G · 110 bars')).toBeVisible();
  // Chunk after the repeated bar: the strip and the Synth both count played bars.
  await page.getByRole('button', { name: 'Chunk 23, Outro end, bars 105–110' }).click();
  await expect(page.getByText('Loop · chunk 23 · Outro end · bars 105–110 · play through')).toBeVisible();
  const video = page.getByRole('region', { name: 'Video' });
  await page.getByRole('button', { name: 'Synth' }).click();
  await expect(video).toHaveAttribute('data-source-status', 'ready', { timeout: 20_000 });
  const before = await stripX(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => stripX(page), { timeout: 10_000 }).toBeLessThan(before - 20);
  await page.getByRole('button', { name: 'Pause' }).click();
});

test('synced lyrics fill the video cell, follow the playhead and can be hidden (ADR-0024)', async ({ page }) => {
  await openSong(page, 'creep');
  const video = page.getByRole('region', { name: 'Video' });
  const lyrics = page.getByTestId('lyrics');
  const toggle = video.getByRole('button', { name: 'Lyrics' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(lyrics).toHaveAttribute('data-synced', 'true');
  await expect(lyrics.getByText('Lyrics · synced to the vocal track')).toBeVisible();
  // Only the key info of the source stays: one row with small count cells.
  await expect(video.getByText('Audio count')).toBeVisible();
  expect((await page.getByTestId('count-cells').locator('div').first().boundingBox())?.height).toBe(26);

  // Bars 9–12: the current line is the one being sung, and it has sung words.
  const current = lyrics.locator('.lyrics-line[data-pos=current]');
  const sung = current.locator('[data-w=sung], [data-w=now]');
  await page.getByRole('button', { name: 'Chunk 3, Verse 1 a, bars 9–12' }).click();
  await expect(current).toHaveCount(1);
  await expect.poll(() => sung.count()).toBeGreaterThan(0);
  const lineAt = () => lyrics.locator('.lyrics-line').evaluateAll((rows) => rows.findIndex((r) => (r as HTMLElement).dataset.pos === 'current'));
  const first = await lineAt();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(lineAt, { timeout: 15_000 }).toBeGreaterThan(first); // scrolls on by itself after the count-in
  await page.getByRole('button', { name: 'Pause' }).click();

  // Hidden: the large count cells come back, and the choice is kept.
  await toggle.click();
  await expect(lyrics).toBeHidden();
  expect((await page.getByTestId('count-cells').locator('div').first().boundingBox())?.height).toBe(76);
  await page.reload();
  await expect(video.getByRole('button', { name: 'Lyrics' })).toHaveAttribute('aria-pressed', 'false');
  await expect(lyrics).toBeHidden();
  await video.getByRole('button', { name: 'Lyrics' }).click();
  await expect(lyrics).toBeVisible();

  // Unsynced lyrics (lyrics.text in song.yaml): no highlight, ↑ ↓ move one line.
  await openSong(page, 'bombtrack');
  await expect(lyrics).toHaveAttribute('data-synced', 'false');
  await expect(lyrics.getByText('Lyrics · not synced · ↑ ↓ to scroll')).toBeVisible();
  const top = lyrics.locator('[data-top]');
  await expect(top).toHaveAttribute('data-top', '0');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(top).toHaveAttribute('data-top', '2');
  await page.keyboard.press('ArrowUp');
  await expect(top).toHaveAttribute('data-top', '1');
  await expect(lyrics.locator('[data-w]')).toHaveCount(0);
});

test('notes are within 15 px of the playhead when plucked, with four notes to its left', async ({ page }) => {
  await openSong(page); // 100 %, the fastest tempo: crosses barlines sooner
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  // Sampling starts during the count-in (ADR-0025), while the first note waits at the playhead.
  await expect(page.getByTestId('count-cells')).toHaveAttribute('data-count-in', 'true');
  const { offsets, leftCounts } = await page.evaluate(async () => {
    const line = document.querySelector('[data-testid=playhead]')!.getBoundingClientRect();
    const centre = line.left + line.width / 2;
    const bandLeft = centre - 15; // notes to the left of a ±15 px band round the line
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
              return b.left + b.width / 2 > clipLeft && b.right < bandLeft;
            }).length,
          );
        }
        if (performance.now() - t0 < 8500) requestAnimationFrame(frame); // 2.2 s count-in + 6.3 s
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
