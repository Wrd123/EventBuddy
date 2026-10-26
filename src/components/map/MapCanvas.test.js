// jsdom has no WebGL, so this checks which base layer is chosen, not how
// it draws (that's checked by eye on the Map screen)
jest.mock('leaflet', () => {
  const addTo = jest.fn();
  return { tileLayer: jest.fn(() => ({ addTo })), maplibreGL: jest.fn(() => ({ addTo })) };
});
jest.mock('leaflet.markercluster', () => ({}));
jest.mock('@maplibre/maplibre-gl-leaflet', () => ({}));

const loadWith = (env) => {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  let loaded;
  jest.isolateModules(() => {
    loaded = { L: require('leaflet'), addBaseLayer: require('./MapCanvas').addBaseLayer };
  });
  process.env = saved;
  return loaded;
};

describe('the map base layer', () => {
  it("is OpenFreeMap's vector map by default, with no key", () => {
    const { L, addBaseLayer } = loadWith({ REACT_APP_MAP_TILE_URL: '' });
    addBaseLayer({});

    expect(L.maplibreGL).toHaveBeenCalledWith({ style: 'https://tiles.openfreemap.org/styles/fiord' });
    expect(L.tileLayer).not.toHaveBeenCalled();
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
