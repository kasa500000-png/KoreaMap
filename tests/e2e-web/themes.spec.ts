import { expect, test } from '@playwright/test';
import { inflateSync } from 'node:zlib';
import { themeNames, designLabelCorpus } from '@korea-map-kit/styles';
test('four themes render Korean labels, icons, zoom rules, overrides and visible attribution without external requests', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(60000);
  const external: string[] = [],
    errors: string[] = [],
    warnings: string[] = [];
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:4173')
      external.push(url.origin);
  });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:4173'
      ? route.continue()
      : route.abort(),
  );
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'warning' && /glyph|font|image/i.test(message.text()))
      warnings.push(message.text());
  });
  await page.setViewportSize({ width: 1440, height: 2200 });
  await page.goto('/themes/');
  for (const theme of themeNames) {
    await expect(page.getByTestId(`status-${theme}`)).toHaveText('ready');
    await expect(page.getByTestId(`layers-${theme}`)).toHaveText(
      /라벨 [1-9]\d*개 \/ 아이콘 [1-9]\d*개/,
    );
    const card = page.getByTestId(`theme-${theme}`),
      attribution = card.locator('.maplibregl-ctrl-attrib');
    await expect(attribution).toBeVisible();
    await expect(attribution).toContainText('Korea Map Kit authored design fixture (MIT)');
    expect(
      await attribution.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          display: style.display,
          opacity: style.opacity,
          color: style.color,
          background: style.backgroundColor,
        };
      }),
    ).toEqual({
      display: 'block',
      opacity: '1',
      color: 'rgb(35, 53, 47)',
      background: 'rgb(255, 255, 255)',
    });
    const box = await card.boundingBox();
    expect(box?.y).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(2200);
    await card.screenshot({ path: testInfo.outputPath(`${theme}.png`) });
  }
  // Browser font resolution + actual raster output; cmap coverage is checked separately.
  await page.evaluate(async (text) => {
    const el = document.createElement('p');
    el.id = 'font-probe';
    el.textContent = text;
    el.style.cssText =
      'font:24px "Noto Sans CJK KR";position:absolute;left:0;top:0;color:#111;background:#fff;z-index:1000';
    document.body.append(el);
    await document.fonts.ready;
    el.getBoundingClientRect();
  }, designLabelCorpus.join(''));
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '#font-probe',
  });
  let fontReport = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  // Wait for actual text shaping after inserting the probe; keep the exact KR-face assertion.
  await expect
    .poll(async () => {
      fontReport = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      return fontReport.fonts.filter((font) => font.glyphCount > 0).map((font) => font.familyName);
    })
    .toContain('Noto Sans CJK KR');
  const glyphs = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 80;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const render = (text: string) => {
      context.clearRect(0, 0, 80, 80);
      context.font = '40px "Noto Sans CJK KR"';
      context.fillText(text, 2, 50);
      return Array.from(context.getImageData(0, 0, 80, 80).data).join(',');
    };
    const missing = render(String.fromCodePoint(0x10ffff));
    return ['한', '글', '힣', 'ㄱ'].map((char) => ({ char, different: render(char) !== missing }));
  });
  expect(glyphs.every((glyph) => glyph.different)).toBe(true);
  await testInfo.attach('font-resolution', {
    body: JSON.stringify({ fontReport, glyphs }),
    contentType: 'application/json',
  });
  await page.locator('#font-probe').evaluate((el) => el.remove());
  await page.getByRole('combobox', { name: '확대 레벨' }).selectOption('10');
  for (const theme of themeNames)
    await expect(page.getByTestId(`layers-${theme}`)).toHaveText('라벨 0개 / 아이콘 0개');
  await page.getByRole('combobox', { name: '확대 레벨' }).selectOption('14');
  await page.getByLabel('수역 사용자 색상').fill('#e4b4d5');
  for (const theme of themeNames) {
    await expect(page.getByTestId(`status-${theme}`)).toHaveText('ready');
    await expect(
      page.getByTestId(`theme-${theme}`).locator('.maplibregl-ctrl-attrib'),
    ).toBeVisible();
    await expect
      .poll(async () =>
        countColor(await page.getByTestId(`theme-${theme}`).screenshot(), [228, 180, 213]),
      )
      .toBeGreaterThan(300);
  }
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

// Read screenshot pixels independently of the style model to verify an actual color override.
function countColor(png: Buffer, rgb: readonly number[]): number {
  const width = png.readUInt32BE(16),
    height = png.readUInt32BE(20),
    channels = png[25] === 6 ? 4 : 3;
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const data = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  let previous = Buffer.alloc(stride),
    position = 0,
    count = 0;
  for (let y = 0; y < height; y++) {
    const filter = data[position++];
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels]! : 0,
        up = previous[x]!,
        upperLeft = x >= channels ? previous[x - channels]! : 0;
      let predict = 0;
      if (filter === 1) predict = left;
      else if (filter === 2) predict = up;
      else if (filter === 3) predict = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft,
          a = Math.abs(p - left),
          b = Math.abs(p - up),
          c = Math.abs(p - upperLeft);
        predict = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      } else if (filter !== 0) throw new Error('Unsupported PNG filter');
      row[x] = (data[position++]! + predict) & 255;
    }
    for (let x = 0; x < stride; x += channels)
      if (row[x] === rgb[0] && row[x + 1] === rgb[1] && row[x + 2] === rgb[2]) count++;
    previous = row;
  }
  return count;
}
