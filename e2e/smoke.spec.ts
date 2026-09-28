import { expect, test } from '@playwright/test';

test('practice layout fills 1440×900 without scrolling', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('navigation', { name: 'Practice plan' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Video' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible();

  const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
  expect(scroll).toEqual([1440, 900]);
});

test('collapsing the practice plan widens the video cell', async ({ page }) => {
  await page.goto('./');
  const video = page.getByRole('region', { name: 'Video' });
  expect((await video.boundingBox())?.width).toBe(619);
  await page.getByRole('button', { name: 'Hide practice plan' }).click();
  expect((await video.boundingBox())?.width).toBe(711);
});

test('fits a 1280 px wide window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./');
  const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
  expect(scroll).toEqual([1280, 800]);
});
