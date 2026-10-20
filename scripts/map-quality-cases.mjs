// Project-authored public-city camera samples. These are not surveyed reference coordinates.
export const qualityRegions = Object.freeze({
  seoul: Object.freeze({ label: '서울', center: Object.freeze([126.978, 37.5665]) }),
  ulsan: Object.freeze({ label: '울산', center: Object.freeze([129.3114, 35.5384]) }),
  busan: Object.freeze({ label: '부산', center: Object.freeze([129.0756, 35.1302]) }),
  jeju: Object.freeze({ label: '제주', center: Object.freeze([126.5312, 33.4996]) }),
});
export const qualityThemes = Object.freeze(['standard', 'dark', 'pastel', 'outdoor']);
export const qualityZooms = Object.freeze([6, 10, 12, 14, 16]);
export const qualityWidths = Object.freeze([390, 768, 1440]);
export const qualityTargets = Object.freeze({
  trials: 30,
  latencyMs: 80,
  downloadBitsPerSecond: 20_000_000,
  coldP95Ms: 3000,
  warmP95Ms: 1500,
  markerCount: 1000,
  frameP95Ms: 33,
  tileGzipP95Bytes: 300 * 1024,
});

export function mapQualityCases() {
  return Object.freeze(
    Object.entries(qualityRegions).flatMap(([region, { center }]) =>
      qualityThemes.flatMap((theme) =>
        qualityZooms.flatMap((zoom) =>
          qualityWidths.map((width) =>
            Object.freeze({
              id: `${region}-${theme}-z${zoom}-${width}`,
              region,
              theme,
              zoom,
              width,
              height: 800,
              camera: Object.freeze({ center, zoom, bearing: 0, pitch: 0 }),
            }),
          ),
        ),
      ),
    ),
  );
}

// Nearest-rank percentile; do not interpolate short or incomplete samples into a pass.
export function percentile(values, fraction) {
  if (
    !Array.isArray(values) ||
    !values.length ||
    [...values].some((value) => !Number.isFinite(value) || value < 0) ||
    !Number.isFinite(fraction) ||
    fraction <= 0 ||
    fraction > 1
  )
    throw new TypeError('Nonempty finite samples and percentile in (0,1] required');
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
}

export function evaluateTiming(values, targetMs) {
  if (!Array.isArray(values) || values.length !== qualityTargets.trials)
    return { status: 'NOT_RUN', trials: values?.length ?? 0, required: qualityTargets.trials };
  const p95Ms = percentile(values, 0.95);
  return { status: p95Ms <= targetMs ? 'PASS' : 'FAIL', trials: values.length, p95Ms, targetMs };
}

export function evaluateScene(summary, zoom, hasContext) {
  if (zoom < 10 && !hasContext) return 'BLOCKED';
  if (zoom < 10 && !(summary.cityLabels > 0)) return 'FAIL';
  if (zoom >= 14 && !(summary.roads > 0 && summary.buildings > 0)) return 'FAIL';
  if (zoom >= 10 && !(summary.roads > 0)) return 'FAIL';
  if (!(summary.labels > 0 && summary.korean)) return 'FAIL';
  return 'PASS';
}

export function evaluateFrames(values, elapsedMs, sourceCount, renderedCount, completed) {
  if (
    values.length < 20 ||
    elapsedMs < 800 ||
    sourceCount !== 1000 ||
    renderedCount !== 1000 ||
    !completed
  )
    return {
      status: 'NOT_RUN',
      samples: values.length,
      elapsedMs,
      sourceCount,
      renderedCount,
      completed,
    };
  const frameP95Ms = percentile(values, 0.95);
  return {
    status: frameP95Ms <= qualityTargets.frameP95Ms ? 'PASS' : 'FAIL',
    samples: values.length,
    elapsedMs,
    sourceCount,
    renderedCount,
    completed,
    frameP95Ms,
  };
}
