// Operator QA metadata only. Keep this function self-contained for the browser bundle.
// No defaults are inferred: unsupported or unreadable values remain explicitly unavailable.
export function collectFrameRendererMetadata(canvas, environment = {}) {
  const unavailable = (reason) => ({ status: 'NOT_AVAILABLE', value: null, reason });
  const text = (read) => {
    try {
      const value = read();
      return typeof value === 'string' && value.trim()
        ? { status: 'AVAILABLE', value: value.slice(0, 1024) }
        : unavailable('NOT_REPORTED');
    } catch {
      return unavailable('READ_FAILED');
    }
  };
  const number = (value) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  const string = (value) => (typeof value === 'string' && value ? value.slice(0, 1024) : null);
  const attributeKeys = [
    'alpha',
    'antialias',
    'depth',
    'desynchronized',
    'failIfMajorPerformanceCaveat',
    'powerPreference',
    'premultipliedAlpha',
    'preserveDrawingBuffer',
    'stencil',
    'xrCompatible',
  ];
  const values = Object.fromEntries(attributeKeys.map((key) => [key, null]));
  let gl;
  let contextReason = 'UNSUPPORTED';
  try {
    gl = canvas?.getContext?.('webgl2');
  } catch {
    contextReason = 'READ_FAILED';
  }
  const parameter = (key) =>
    contextLost.value === true
      ? unavailable('CONTEXT_LOST')
      : typeof gl?.getParameter === 'function' && typeof key === 'number'
        ? text(() => gl.getParameter(key))
        : unavailable('UNSUPPORTED');
  let extension;
  let debugRendererInfo = unavailable('UNSUPPORTED');
  if (typeof gl?.getExtension === 'function') {
    try {
      extension = gl.getExtension('WEBGL_debug_renderer_info');
      debugRendererInfo = extension
        ? { status: 'AVAILABLE', value: true }
        : unavailable('UNSUPPORTED');
    } catch {
      debugRendererInfo = unavailable('READ_FAILED');
    }
  }
  let contextLost = unavailable('UNSUPPORTED');
  if (typeof gl?.isContextLost === 'function') {
    try {
      const value = gl.isContextLost();
      contextLost =
        typeof value === 'boolean' ? { status: 'AVAILABLE', value } : unavailable('NOT_REPORTED');
    } catch {
      contextLost = unavailable('READ_FAILED');
    }
  }
  let attributesReason = gl ? 'UNSUPPORTED' : contextReason;
  if (typeof gl?.getContextAttributes === 'function') {
    try {
      const actual = gl.getContextAttributes();
      attributesReason = contextLost.value === true ? 'CONTEXT_LOST' : 'NOT_REPORTED';
      if (actual && typeof actual === 'object' && contextLost.value !== true) {
        for (const key of attributeKeys) {
          const value = actual[key];
          if (
            key === 'powerPreference'
              ? typeof value === 'string' && value
              : typeof value === 'boolean'
          )
            values[key] = value;
        }
      }
    } catch {
      attributesReason = 'READ_FAILED';
    }
  }
  const missing = attributeKeys.filter((key) => values[key] === null);
  const attributes = {
    status:
      missing.length === 0
        ? 'AVAILABLE'
        : missing.length === attributeKeys.length
          ? 'NOT_AVAILABLE'
          : 'PARTIAL',
    values,
    unavailable: missing,
    ...(missing.length > 0 ? { reason: attributesReason } : {}),
  };
  const maskedRenderer = parameter(gl?.RENDERER);
  const unmaskedRenderer = parameter(extension?.UNMASKED_RENDERER_WEBGL);
  const maskedVendor = parameter(gl?.VENDOR);
  const unmaskedVendor = parameter(extension?.UNMASKED_VENDOR_WEBGL);
  const renderer = unmaskedRenderer.value ?? maskedRenderer.value;
  const softwareEvidence =
    renderer?.match(/swiftshader|llvmpipe|softpipe|software rasterizer|software renderer/gi) ?? [];
  return {
    metadataSchemaVersion: 1,
    browser: string(environment.userAgent) ?? 'UNAVAILABLE',
    webglRenderer: renderer ?? 'UNAVAILABLE',
    canvasWidth: number(canvas?.width),
    canvasHeight: number(canvas?.height),
    devicePixelRatio: number(environment.devicePixelRatio),
    viewport: {
      width: number(environment.viewportWidth),
      height: number(environment.viewportHeight),
    },
    device: {
      platform: string(environment.platform),
      hardwareConcurrency: number(environment.hardwareConcurrency),
      memoryGiB: number(environment.deviceMemory),
    },
    webgl: {
      status: gl && contextLost.value !== true ? 'AVAILABLE' : 'NOT_AVAILABLE',
      contextType: gl ? 'webgl2' : null,
      ...(!gl || contextLost.value === true
        ? { reason: contextLost.value === true ? 'CONTEXT_LOST' : contextReason }
        : {}),
      contextLost,
      attributes,
      debugRendererInfo,
      renderer: { masked: maskedRenderer, unmasked: unmaskedRenderer },
      vendor: { masked: maskedVendor, unmasked: unmaskedVendor },
      version: parameter(gl?.VERSION),
      shadingLanguageVersion: parameter(gl?.SHADING_LANGUAGE_VERSION),
    },
    softwareRendering: {
      status: softwareEvidence.length ? 'DETECTED' : renderer ? 'UNCONFIRMED' : 'NOT_AVAILABLE',
      evidence: [...new Set(softwareEvidence.map((value) => value.toLowerCase()))],
      source: unmaskedRenderer.value
        ? 'unmasked-renderer'
        : maskedRenderer.value
          ? 'masked-renderer'
          : null,
      method:
        'renderer-string-heuristic; absence of a software marker does not establish hardware acceleration',
    },
  };
}
