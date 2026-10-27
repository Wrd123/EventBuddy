// jsdom has no WebGL, so this checks which base layer is chosen, not how
// it draws (that's checked by eye on the Map screen)
jest.mock('leaflet', () => {
  const addTo = jest.fn();
  return { tileLayer: jest.fn(() => ({ addTo })), maplibreGL: jest.fn(() => ({ addTo })) };
});
jest.mock('leaflet.markercluster', () => ({}));
jest.mock('@maplibre/maplibre-gl-leaflet', () => ({}));

// The settings are read when the module loads, so each test loads it afresh
const loadWith = (env) => {
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  let loaded;
  jest.isolateModules(() => {
    loaded = { L: require('leaflet'), addBaseLayer: require('./MapCanvas').addBaseLayer };
  });
  Object.entries(saved).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  return loaded;
};

// jsdom has no canvas drawing; this stands in for a phone with or without WebGL
const withWebGL = (available) =>
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => (available ? {} : null));

afterEach(() => jest.restoreAllMocks());

describe('the map base layer', () => {
  it("is OpenFreeMap's vector map by default, with no key", () => {
    withWebGL(true);
    const { L, addBaseLayer } = loadWith({ REACT_APP_MAP_TILE_URL: '' });
    addBaseLayer({});

    expect(L.maplibreGL).toHaveBeenCalledWith({ style: 'https://tiles.openfreemap.org/styles/liberty' });
    expect(L.tileLayer).not.toHaveBeenCalled();
  });

  it("falls back to OpenStreetMap's plain tiles without WebGL", () => {
    withWebGL(false);
    const { L, addBaseLayer } = loadWith({ REACT_APP_MAP_TILE_URL: '' });
    addBaseLayer({});

    expect(L.maplibreGL).not.toHaveBeenCalled();
    expect(L.tileLayer).toHaveBeenCalledWith(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      expect.objectContaining({ attribution: expect.stringContaining('OpenStreetMap'), className: 'eb-tiles-fallback' })
    );
  });

  it('uses the tiles and credit set in the environment instead', () => {
    const { L, addBaseLayer } = loadWith({
      REACT_APP_MAP_TILE_URL: 'https://tiles.example.com/{z}/{x}/{y}.png',
      REACT_APP_MAP_ATTRIBUTION: '© Example'
    });
    addBaseLayer({});

    expect(L.tileLayer).toHaveBeenCalledWith('https://tiles.example.com/{z}/{x}/{y}.png', expect.objectContaining({ attribution: '© Example' }));
    expect(L.maplibreGL).not.toHaveBeenCalled();
  });
});
