import { expect, test, type Page } from '@playwright/test';
import type { CameraState, MapSelection } from 'korea-map-core';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer, origin: string, temporary: string;
const unexpected = new WeakMap<Page, string[]>();
test.beforeAll(async () => {
  const root = process.cwd();
  mkdirSync(resolve(root, 'artifacts/qa'), { recursive: true });
  temporary = mkdtempSync(resolve(root, 'artifacts/qa/interaction-'));
  const publicDir = resolve(temporary, 'public');
  mkdirSync(publicDir);
  const require = createRequire(import.meta.url);
  cpSync(
    resolve(dirname(require.resolve('maplibre-gl/package.json')), 'dist/maplibre-gl-worker.mjs'),
    resolve(publicDir, 'worker.mjs'),
  );
  writeFileSync(
    resolve(temporary, 'index.html'),
    `<!doctype html><html lang="ko"><meta charset="utf-8"><link rel="icon" href="data:,"><style>body{margin:0}#map{width:100%;height:600px;position:relative}</style><div id="map"></div><script type="module">
import { createMap, createMapState } from 'korea-map-web';
import { createCancellationSource } from 'korea-map-core';
import { Map as LibreMap, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
const state = createMapState({camera:{center:[126.978,37.5665],zoom:10,bearing:0,pitch:0}});
const map = await createMap({container:document.getElementById('map'),state,workerUrl:'/worker.mjs',clustering:{},interactionPoiLayers:['qa-poi'],config:{mode:'inline',allowedOrigins:[],costAcknowledged:true,attribution:'자체 합성 상호작용 QA · MIT',style:{version:8,sources:{qa:{type:'geojson',data:{type:'FeatureCollection',features:[{type:'Feature',properties:{fid:'synthetic-poi','name:ko':'합성 시설',unrelatedPayload:'never-return'},geometry:{type:'Point',coordinates:[126.978,37.5665]}}]}}},layers:[{id:'background',type:'background',paint:{'background-color':'#eef2ed'}},{id:'qa-poi',type:'circle',source:'qa',paint:{'circle-color':'#115e59','circle-radius':7}}]}}});
const qa = window.interactionQa = {map,engineTypes:{Map:LibreMap,GeoJSONSource},events:[],notifications:0,createCancellationSource,makeMarkers:(count)=>Array.from({length:count},(_,i)=>({id:'m'+String(i).padStart(4,'0'),label:'합성 장소 '+i,coordinate:[126.978+(i%10)*0.000001,37.5665+Math.floor(i/10)*0.000001]}))};
let previous = state.getSnapshot().markers;
state.subscribe(()=>{const next=state.getSnapshot().markers;if(next!==previous){qa.notifications++;previous=next;}});
map.interactions.onEvent(event=>qa.events.push(event));
await map.ready; document.body.dataset.ready='true';
</script></html>`,
  );
  server = await createServer({
    configFile: false,
    root,
    publicDir,
    server: { host: '127.0.0.1', port: 0 },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await server.listen();
  origin = server.resolvedUrls!.local[0]!;
});
test.afterAll(async () => {
  await server?.close();
  if (temporary) rmSync(temporary, { recursive: true, force: true });
});
test.beforeEach(async ({ page, context }) => {
  const failures: string[] = [];
  unexpected.set(page, failures);
  page.on('pageerror', () => failures.push('PAGE_ERROR'));
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === new URL(origin).origin) return route.continue();
    failures.push('UNEXPECTED_NETWORK');
    return route.abort();
  });
  await page.goto(
    `${origin}${relative(process.cwd(), temporary).replaceAll('\\', '/')}/index.html`,
  );
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
});
test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(`window.interactionQa?.map.destroy()`);
  expect(unexpected.get(page)).toEqual([]);
});

test('animated camera resolves at completion; signal/replacement/gesture cancel in place and legacy API remains usable', async ({
  page,
}) => {
  const completion = await page.evaluate(async () => {
    const qa = (
      globalThis as unknown as { interactionQa: { map: import('korea-map-web').MapHandle } }
    ).interactionQa;
    const began = performance.now();
    await qa.map.interactions!.transitionCamera({
      center: [126.99, 37.57],
      zoom: 12,
      bearing: 25,
      pitch: 10,
    });
    return { elapsed: performance.now() - began, camera: qa.map.state.getSnapshot().camera };
  });
  expect(completion.elapsed).toBeGreaterThan(200);
  expect(completion.camera.zoom).toBeCloseTo(12, 5);
  await page.evaluate(
    `(() => {const qa=window.interactionQa;qa.cancel=qa.createCancellationSource();qa.pending=qa.map.interactions.transitionCamera({center:[127.1,37.7],zoom:15,bearing:0,pitch:0},{durationMs:1000,signal:qa.cancel.signal}).then(()=> 'complete',e=>e.code);})()`,
  );
  await expect
    .poll(() => page.evaluate(`window.interactionQa.map.state.getSnapshot().camera.zoom`))
    .toBeGreaterThan(12.05);
  const aborted = await page.evaluate<{ result: string; zoom: number }>(
    `(async()=>{const qa=window.interactionQa;qa.cancel.cancel();return {result:await qa.pending,zoom:qa.map.state.getSnapshot().camera.zoom};})()`,
  );
  expect(aborted.result).toBe('ABORTED');
  expect(aborted.zoom).toBeGreaterThan(12);
  expect(aborted.zoom).toBeLessThan(15);
  const replacement = await page.evaluate(
    `(async()=>{const {map}=window.interactionQa;const first=map.interactions.transitionCamera({center:[127.1,37.7],zoom:15,bearing:0,pitch:0},{durationMs:1000}).then(()=> 'complete',e=>e.code);await map.interactions.transitionCamera({center:[126.978,37.5665],zoom:11,bearing:0,pitch:0},{durationMs:100});return first;})()`,
  );
  expect(replacement).toBe('ABORTED');
  await page.evaluate(
    `(()=>{const qa=window.interactionQa;qa.pending=qa.map.interactions.transitionCamera({center:[127,37.59],zoom:14,bearing:0,pitch:0},{durationMs:2000}).then(()=> 'complete',e=>e.code);})()`,
  );
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw Error('Canvas missing');
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 250, { steps: 10 });
  await page.mouse.up();
  expect(await page.evaluate(`window.interactionQa.pending`)).toBe('ABORTED');
  expect(await page.evaluate(`window.interactionQa.events.some(e=>e.type==='gesture')`)).toBe(true);
  expect(
    await page.evaluate(
      `window.interactionQa.events.some(e=>e.type==='camera'&&e.origin==='gesture')`,
    ),
  ).toBe(true);
  await page.evaluate(`window.interactionQa.map.api.setCenter([126.98,37.57])`);
  expect(
    await page.evaluate(`window.interactionQa.map.state.getSnapshot().camera.center[0]`),
  ).toBeCloseTo(126.98, 5);
});

test('fitBounds honors asymmetric renderer insets and actual visible bounds', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { map } = (
      globalThis as unknown as { interactionQa: { map: import('korea-map-web').MapHandle } }
    ).interactionQa;
    const target = { west: 126.97, south: 37.56, east: 126.99, north: 37.58 };
    await map.interactions!.fitBounds(target, {
      insets: { top: 40, right: 30, bottom: 200, left: 160 },
    });
    const bounds = await map.api.getVisibleBounds();
    const canvas = globalThis.document.querySelector('canvas')!;
    const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const project = (lon: number, lat: number) => ({
      x: ((lon - bounds.west) / (bounds.east - bounds.west)) * canvas.clientWidth,
      y:
        ((mercator(bounds.north) - mercator(lat)) /
          (mercator(bounds.north) - mercator(bounds.south))) *
        canvas.clientHeight,
    });
    return {
      bounds,
      nw: project(target.west, target.north),
      se: project(target.east, target.south),
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    };
  });
  expect(result.nw.x).toBeGreaterThanOrEqual(159);
  expect(result.nw.y).toBeGreaterThanOrEqual(39);
  expect(result.se.x).toBeLessThanOrEqual(result.width - 29);
  expect(result.se.y).toBeLessThanOrEqual(result.height - 199);
});

test('GPU clusters, one marker batch, selected marker visibility, cluster expansion and bounded detached picking', async ({
  page,
}) => {
  await page.evaluate(
    `window.interactionQa.map.interactions.setMarkers(window.interactionQa.makeMarkers(1000))`,
  );
  expect(await page.evaluate(`window.interactionQa.notifications`)).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(`window.interactionQa.map.getRenderedFeatures(['kmk-marker-clusters']).length`),
    )
    .toBeGreaterThan(0);
  const cluster = await page.evaluate<MapSelection | undefined>(
    `(async()=>{const qa=window.interactionQa,canvas=document.querySelector('canvas');return (await qa.map.interactions.pickFeatures({x:canvas.clientWidth/2,y:canvas.clientHeight/2})).find(f=>f.kind==='cluster');})()`,
  );
  expect(cluster?.count).toBe(1000);
  if (!cluster) throw Error('Cluster not picked');
  await page.evaluate(
    `(()=>{const qa=window.interactionQa,m=qa.map.state.getSnapshot().markers[0];return qa.map.interactions.selectFeature({key:'marker:'+m.id,id:m.id,kind:'marker',label:m.label,coordinate:m.coordinate});})()`,
  );
  await expect
    .poll(() =>
      page.evaluate(`window.interactionQa.map.getRenderedFeatures(['kmk-marker-selected']).length`),
    )
    .toBeGreaterThan(0);
  await page.evaluate(
    (selection) =>
      (
        globalThis as unknown as { interactionQa: { map: import('korea-map-web').MapHandle } }
      ).interactionQa.map.interactions!.selectFeature(selection),
    cluster,
  );
  expect(
    await page.evaluate(`window.interactionQa.map.state.getSnapshot().camera.zoom`),
  ).toBeGreaterThan(10);
  await page.evaluate(
    `(async()=>{const qa=window.interactionQa;await qa.map.interactions.transitionCamera({center:[126.978,37.5665],zoom:16,bearing:0,pitch:0},{durationMs:0});await qa.map.interactions.setMarkers(qa.makeMarkers(12).map(m=>({...m,coordinate:[126.978,37.5665]})));})()`,
  );
  await expect
    .poll(() => page.evaluate(`window.interactionQa.map.diagnostics().renderedMarkers`))
    .toBe(12);
  const picks = await page.evaluate<readonly MapSelection[]>(
    `(async()=>{const c=document.querySelector('canvas');return window.interactionQa.map.interactions.pickFeatures({x:c.clientWidth/2,y:c.clientHeight/2});})()`,
  );
  expect(picks).toHaveLength(8);
  expect(picks.map((pick) => pick.id)).toEqual(Array.from({ length: 8 }, (_, i) => `m000${i}`));
  expect(JSON.stringify(picks)).not.toContain('unrelatedPayload');
  await page.evaluate(`window.interactionQa.map.interactions.setMarkers([])`);
  await expect
    .poll(() => page.evaluate(`window.interactionQa.map.diagnostics().renderedMarkers`))
    .toBe(0);
  const poi = await page.evaluate<MapSelection | undefined>(
    `(async()=>{const c=document.querySelector('canvas');return (await window.interactionQa.map.interactions.pickFeatures({x:c.clientWidth/2,y:c.clientHeight/2})).find(f=>f.kind==='poi');})()`,
  );
  expect(poi?.key).toBe('poi:qa:qa-poi:synthetic-poi');
  if (!poi) throw Error('POI not picked');
  await page.evaluate(
    (selection) =>
      (
        globalThis as unknown as { interactionQa: { map: import('korea-map-web').MapHandle } }
      ).interactionQa.map.interactions!.selectFeature(selection),
    poi,
  );
  await expect
    .poll(() =>
      page.evaluate(
        `window.interactionQa.map.getRenderedFeatures(['kmk-picked-highlight']).length`,
      ),
    )
    .toBeGreaterThan(0);
});

test('system reduced motion is immediate; extension destruction preserves base map and base destruction cleans listeners', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const elapsed = await page.evaluate(
    `(async()=>{const began=performance.now();await window.interactionQa.map.interactions.transitionCamera({center:[126.98,37.57],zoom:12,bearing:0,pitch:0},{durationMs:800});return performance.now()-began;})()`,
  );
  expect(elapsed).toBeLessThan(500);
  const result = await page.evaluate<{ result: string; camera: CameraState }>(
    `(async()=>{const {map}=window.interactionQa;map.interactions.destroy();await map.api.setCenter([126.99,37.58]);return {camera:map.state.getSnapshot().camera,result:await map.interactions.pickFeatures({x:1,y:1}).then(()=> 'complete',e=>e.code)};})()`,
  );
  expect(result.result).toBe('UNAVAILABLE');
  expect(result.camera.center[0]).toBeCloseTo(126.99, 5);
  await expect(page.locator('canvas')).toHaveCount(1);
  const cleanup = await page.evaluate(
    `(()=>{const {map}=window.interactionQa;map.destroy();return map.diagnostics();})()`,
  );
  expect(cleanup).toMatchObject({ status: 'destroyed', listeners: 0, observing: false });
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('100 camera commands retain 1000 markers without feature queries, source writes or selector rebuilds', async ({
  page,
}) => {
  await page.evaluate(`(async()=>{
    const qa=window.interactionQa;
    await qa.map.interactions.transitionCamera({center:[126.978,37.5665],zoom:16,bearing:0,pitch:0},{durationMs:0});
    await qa.map.interactions.setMarkers(qa.makeMarkers(1000));
  })()`);
  await expect
    .poll(() => page.evaluate(`window.interactionQa.map.diagnostics().renderedMarkers`))
    .toBe(1000);
  const result = await page.evaluate<{
    queries: number;
    sourceWrites: number;
    mutations: number;
    cameraEvents: number;
    sameOptions: boolean;
    markers: number;
    rendered: number;
    longitude: number;
  }>(`(async()=>{
    const {map,engineTypes}=window.interactionQa;
    const selector=document.querySelector('.kmk-place-selector'), options=[...selector.options];
    let queries=0,sourceWrites=0,mutations=0,cameraEvents=0;
    const originalQuery=engineTypes.Map.prototype.queryRenderedFeatures;
    const originalSetData=engineTypes.GeoJSONSource.prototype.setData;
    engineTypes.Map.prototype.queryRenderedFeatures=function(...args){queries++;return originalQuery.apply(this,args)};
    engineTypes.GeoJSONSource.prototype.setData=function(...args){sourceWrites++;return originalSetData.apply(this,args)};
    const observer=new MutationObserver(records=>mutations+=records.length);
    observer.observe(selector,{childList:true,subtree:true,characterData:true});
    const off=map.on('camera',()=>cameraEvents++);
    try{
      for(let i=1;i<=100;i++) await map.api.setCenter([126.978+i*0.0000001,37.5665]);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    }finally{
      mutations+=observer.takeRecords().length;observer.disconnect();off();
      engineTypes.Map.prototype.queryRenderedFeatures=originalQuery;
      engineTypes.GeoJSONSource.prototype.setData=originalSetData;
    }
    return {queries,sourceWrites,mutations,cameraEvents,
      sameOptions:selector.options.length===1001&&options.every((option,i)=>option===selector.options[i]),
      markers:map.state.getSnapshot().markers.length,rendered:map.diagnostics().renderedMarkers,
      longitude:map.state.getSnapshot().camera.center[0]};
  })()`);
  expect(result).toMatchObject({
    queries: 0,
    sourceWrites: 0,
    mutations: 0,
    cameraEvents: 100,
    sameOptions: true,
    markers: 1000,
    rendered: 1000,
  });
  expect(result.longitude).toBeCloseTo(126.97801, 7);
});
