import {
  createCartographyStyle,
  designV1,
  designV2,
  type CartographyCapabilities,
  type CartographyStyleOptions,
} from 'korea-map-styles';

const capabilities: CartographyCapabilities = { rail: true, ocean: false, landmask: false };
const options: CartographyStyleOptions = {
  theme: 'standard',
  target: 'native',
  density: 'balanced',
  schema: 'design-v2',
  data: {
    mode: 'operator',
    source: { type: 'vector', tiles: ['https://operator.example.invalid/{z}/{x}/{y}.pbf'] },
    sourceLayers: Object.fromEntries(designV2.requiredLayers.map((kind) => [kind, kind])),
    attribution: 'Reviewed OSM ODbL',
    capabilities,
  },
  typography: {
    mode: 'glyphs',
    fontStack: ['OperatorNoto'],
    url: 'https://operator.example.invalid/{fontstack}/{range}.pbf',
  },
};
createCartographyStyle(options);
designV1.requiredLayers satisfies readonly string[];
designV2.optionalLayers satisfies readonly string[];
// @ts-expect-error Density is a finite public contract.
createCartographyStyle({ ...options, density: 'unrestricted' });
// @ts-expect-error Capabilities cannot carry a provider URL or secret.
const wrongCapability: CartographyCapabilities = { rail: 'https://provider.example.invalid' };
void wrongCapability;
