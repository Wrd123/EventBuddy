import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';

// Map tiles. By default, OpenStreetMap's own tiles, darkened in CSS to fit
// the night theme: free and keyless, but OpenStreetMap's tile policy is for
// light use, so a launched app should use a tile provider. Set
// REACT_APP_MAP_TILE_URL (and REACT_APP_MAP_ATTRIBUTION, the provider's
// required credit) to a dark style, e.g. Stadia's alidade_smooth_dark; those
// tiles are shown as-is.
const CUSTOM_TILES = process.env.REACT_APP_MAP_TILE_URL;
const TILE_URL = CUSTOM_TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = CUSTOM_TILES
  ? process.env.REACT_APP_MAP_ATTRIBUTION || ''
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// The continental US, when there's nothing to show yet
const DEFAULT_VIEW = { center: [39.8, -98.6], zoom: 4 };
// Fitting to a single pin shouldn't zoom in to street level
const MAX_FIT_ZOOM = 12;

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const iconFor = (pin, selected) => {
  const size = pin.kind === 'mine' ? 30 : 24;
  const count = pin.count > 1 ? escapeHtml(pin.count) : '';
  return L.divIcon({
    className: '',
    html: `<div class="eb-pin eb-pin-${pin.kind}${selected ? ' eb-pin-selected' : ''}">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};

// A Leaflet map with tappable pins. Leaflet manages its own DOM, so this
// wraps it imperatively: React owns the props, Leaflet owns what's drawn.
//
// pins: [{ id, kind: 'mine' | 'nearby', lat, lng, label, count }]
// selectedId: the highlighted pin, kept in view
// fitKey: whenever it changes, the view fits all pins (or centers on
//   fallbackCenter { lat, lng } when there are none)
// focusId: a pin to start on instead, the first time it's there to fit to
const MapCanvas = ({ pins, selectedId, onSelect, fitKey, fallbackCenter, focusId }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const latest = useRef({ pins, fallbackCenter, selectedId, focusId });
  latest.current = { pins, fallbackCenter, selectedId, focusId };
  const focused = useRef(false);

  useEffect(() => {
    const map = L.map(containerRef.current, { zoomControl: false }).setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
    L.tileLayer(TILE_URL, {
      attribution: ATTRIBUTION,
      maxZoom: 19,
      className: CUSTOM_TILES ? '' : 'eb-tiles-darkened'
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    // Tapping empty map clears the selection
    map.on('click', () => onSelectRef.current(null));
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    layer.clearLayers();
    pins.forEach((pin) => {
      L.marker([pin.lat, pin.lng], {
        icon: iconFor(pin, pin.id === selectedId),
        title: pin.label,
        alt: pin.label,
        keyboard: true,
        zIndexOffset: pin.id === selectedId ? 1000 : pin.kind === 'mine' ? 500 : 0
      })
        .on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectRef.current(pin.id);
        })
        .addTo(layer);
    });
  }, [pins, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    const { pins: current, fallbackCenter: fallback, focusId: focusOn } = latest.current;
    const focus = !focused.current && current.find((p) => p.id === focusOn);
    if (focus) {
      focused.current = true;
      map.setView([focus.lat, focus.lng], MAX_FIT_ZOOM);
    } else if (current.length > 0) {
      map.fitBounds(L.latLngBounds(current.map((p) => [p.lat, p.lng])).pad(0.15), { maxZoom: MAX_FIT_ZOOM });
    } else if (fallback) {
      map.setView([fallback.lat, fallback.lng], 10);
    }
  }, [fitKey]);

  // Keep the selected pin on screen
  useEffect(() => {
    const pin = latest.current.pins.find((p) => p.id === selectedId);
    if (pin) mapRef.current.panInside([pin.lat, pin.lng], { padding: [48, 48] });
  }, [selectedId]);

  return <div ref={containerRef} className="absolute inset-0" />;
};

export default MapCanvas;
