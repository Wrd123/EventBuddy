import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-leaflet';
import './map.css';
import { glideDuration, pointAt } from '../../utils/glide';
import { prefersReducedMotion } from '../../utils/motion';

// Map tiles. By default, OpenFreeMap's Liberty style, turned dark in map.css:
// free, keyless and with no view limit (openfreemap.org), drawn as vector
// tiles by MapLibre inside Leaflet, so labels stay sharp at every zoom. Its
// required credit (OpenFreeMap, OpenMapTiles, OpenStreetMap) comes with the
// style. Liberty draws buildings, landmarks and park names, which friends use
// to find each other; the darker Fiord and "dark" styles leave those out.
// CARTO's dark basemap was the first choice, but as of October 2026 it shows
// "API key required" without a key, and the map stays keyless so a fresh
// clone runs as it is. REACT_APP_MAP_TILE_URL (with REACT_APP_MAP_ATTRIBUTION,
// the provider's required credit) swaps in any raster tile URL instead.
const CUSTOM_TILES = process.env.REACT_APP_MAP_TILE_URL;
const CUSTOM_ATTRIBUTION = process.env.REACT_APP_MAP_ATTRIBUTION || '';
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
// Street level; closer than this, raster tiles run out
const MAX_ZOOM = 19;

// Vector maps need WebGL. A phone or browser without it (a blocked GPU, a
// locked-down web view) gets OpenStreetMap's plain tiles, darkened in
// map.css, so the screen still works.
const FALLBACK_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const FALLBACK_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const hasWebGL = () => {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
};

export const addBaseLayer = (map) => {
  if (CUSTOM_TILES) {
    L.tileLayer(CUSTOM_TILES, { attribution: CUSTOM_ATTRIBUTION, maxZoom: MAX_ZOOM }).addTo(map);
  } else if (hasWebGL()) {
    L.maplibreGL({ style: STYLE_URL }).addTo(map);
  } else {
    L.tileLayer(FALLBACK_TILES, { attribution: FALLBACK_ATTRIBUTION, maxZoom: MAX_ZOOM, className: 'eb-tiles-fallback' }).addTo(map);
  }
};

// The continental US, when there's nothing to show yet
const DEFAULT_VIEW = { center: [39.8, -98.6], zoom: 4 };
// Fitting to a single pin shouldn't zoom in to street level, except when
// finding friends, where the next street over matters
const MAX_FIT_ZOOM = 12;
const MAX_LIVE_ZOOM = 17;

const SIZES = { mine: 30, nearby: 24, friend: 34, meetup: 34, me: 18 };
// Drawn above each other in this order
const LAYERS = { nearby: 0, mine: 300, meetup: 600, friend: 700, me: 800 };

const FLAG_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>';

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeColor = (color) => (/^#[0-9a-f]{6}$/i.test(color || '') ? color : '#64748b');

// Captions carry people's names, which are whatever they typed. Leaflet
// puts string tooltip content in as HTML, so a caption goes in as a text
// node and a name like "<img onerror=…>" shows as those characters.
const captionNode = (caption) => document.createTextNode(caption);

const iconHtml = (pin, selected) => {
  const classes = ['eb-pin', `eb-pin-${pin.kind}`, selected && 'eb-pin-selected', pin.stale && 'eb-pin-stale']
    .filter(Boolean)
    .join(' ');
  if (pin.kind === 'friend') {
    return `<div class="${classes}" data-color="${safeColor(pin.color)}">${escapeHtml(pin.initial || '?')}</div>`;
  }
  if (pin.kind === 'meetup') return `<div class="${classes}">${FLAG_SVG}</div>`;
  return `<div class="${classes}">${pin.count > 1 ? escapeHtml(pin.count) : ''}</div>`;
};

// The web page's Content Security Policy (render.yaml) refuses inline style
// attributes, so a friend's color goes on through the DOM instead
const iconFor = (html, kind) => {
  const size = SIZES[kind] || 24;
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const node = holder.firstElementChild;
  if (node.dataset.color) node.style.background = node.dataset.color;
  return L.divIcon({ className: '', html: node, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
};

// Venues close together on screen merge into one bubble showing how many
// events are inside; it splits apart as you zoom in or tap it
const clusterIcon = (cluster) => {
  const events = cluster.getAllChildMarkers().reduce((sum, m) => sum + (m.options.eventCount || 1), 0);
  const size = events >= 100 ? 44 : events >= 10 ? 38 : 32;
  return L.divIcon({
    className: '',
    html: `<div class="eb-pin eb-pin-nearby eb-cluster">${events}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};

// Only people on the move glide. The other pins are places, which don't.
const GLIDES = new Set(['friend', 'me']);
// A fix less accurate than this gets a circle around its pin showing how far
// off it could be; better than that, the circle would only be clutter
const SHOW_ACCURACY_ABOVE_M = 20;
// Past this, no circle: a laptop's Wi-Fi or IP fix can be kilometres out,
// and a circle that size would tint the whole map and say nothing useful
const SHOW_ACCURACY_UP_TO_M = 1000;

// A friend's position is a guess within their fix's accuracy. A circle of
// that radius sits under the pin while the guess is a loose one.
const syncAccuracy = (entry, pin) => {
  const wanted = pin.kind === 'friend' && pin.accuracy > SHOW_ACCURACY_ABOVE_M && pin.accuracy <= SHOW_ACCURACY_UP_TO_M;
  if (wanted && entry.circle) {
    entry.circle.setRadius(pin.accuracy);
  } else if (wanted) {
    const at = entry.marker.getLatLng();
    entry.circle = L.circle(at, { radius: pin.accuracy, className: 'eb-accuracy', interactive: false });
    entry.group.addLayer(entry.circle);
  } else if (entry.circle) {
    entry.group.removeLayer(entry.circle);
    entry.circle = null;
  }
};

// Moves pins smoothly between the points they were sent, one
// requestAnimationFrame loop for all of them. A pin with a glide in progress
// has entry.glide = { from, to, startedAt, duration }; the loop runs only
// while there is one. entries is the map of placed pins, owned by MapCanvas.
const createGlider = (entries) => {
  let frame = null;

  // Draws a pin (and its accuracy circle, which belongs under it) at a point
  const draw = (entry, at) => {
    entry.marker.setLatLng([at.lat, at.lng]);
    if (entry.circle) entry.circle.setLatLng([at.lat, at.lng]);
  };

  // Stops the loop when no pin is left to move (one was removed, say)
  const settle = () => {
    if (frame !== null && !anyGliding()) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };

  const anyGliding = () => [...entries.values()].some((entry) => entry.glide);

  const tick = () => {
    frame = null;
    const now = performance.now();
    entries.forEach((entry) => {
      const glide = entry.glide;
      if (!glide) return;
      draw(entry, pointAt(glide.from, glide.to, glide.startedAt, glide.duration, now));
      if (now >= glide.startedAt + glide.duration) entry.glide = null;
    });
    if (anyGliding()) frame = requestAnimationFrame(tick);
  };

  return {
    // Heads for a new point: gliding from where the pin is drawn right now
    // (even partway through the last glide) when it should, jumping if not
    moveTo(entry, to, duration) {
      if (duration > 0) {
        const from = entry.marker.getLatLng();
        entry.glide = { from: { lat: from.lat, lng: from.lng }, to, startedAt: performance.now(), duration };
        if (frame === null) frame = requestAnimationFrame(tick);
      } else {
        entry.glide = null;
        draw(entry, to);
      }
    },
    // Puts every gliding pin at its destination, for when the page comes
    // back: frames don't run while it's hidden, so pins would sit mid-way
    snapAll() {
      entries.forEach((entry) => {
        if (!entry.glide) return;
        draw(entry, entry.glide.to);
        entry.glide = null;
      });
      settle();
    },
    settle,
    stop() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    }
  };
};

// A Leaflet map with tappable pins. Leaflet manages its own DOM, so this
// wraps it imperatively: React owns the props, Leaflet owns what's drawn.
// Pins are updated in place by id, so friends glide to new positions and
// their labels don't flicker when positions refresh.
//
// pins: [{ id, kind: 'mine' | 'nearby' | 'friend' | 'meetup' | 'me', lat, lng,
//   label, count (nearby), color + initial + caption + stale + accuracy (friend),
//   fixAt (friend, me: when the position was measured, in ms) }]
// selectedId: the highlighted pin, kept in view
// fitKey: whenever it changes, the view fits fitIds' pins (or all pins, or
//   centers on fallbackCenter { lat, lng } when there are none)
// focusId: a pin to start on instead, the first time it's there to fit to
// ref: getCenter() -> { lat, lng }, for placing a meetup point
const MapCanvas = forwardRef(({ pins, selectedId, onSelect, fitKey, fitIds, fallbackCenter, focusId }, ref) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const clusterRef = useRef(null);
  const markers = useRef(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const latest = useRef({});
  latest.current = { pins, fallbackCenter, selectedId, focusId, fitIds };
  const focused = useRef(false);
  const [glider] = useState(() => createGlider(markers.current));

  useImperativeHandle(ref, () => ({
    getCenter: () => {
      const { lat, lng } = mapRef.current.getCenter();
      return { lat, lng };
    }
  }));

  useEffect(() => {
    // The marker clusters need a top zoom, which a vector base layer doesn't set
    const map = L.map(containerRef.current, { zoomControl: false, maxZoom: MAX_ZOOM }).setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
    addBaseLayer(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    // Tapping empty map clears the selection
    map.on('click', () => onSelectRef.current(null));
    layerRef.current = L.layerGroup().addTo(map);
    clusterRef.current = L.markerClusterGroup({
      iconCreateFunction: clusterIcon,
      showCoverageOnHover: false,
      maxClusterRadius: 45
    }).addTo(map);
    mapRef.current = map;
    // The panel under the map changes height (the meetup form, say), and
    // Leaflet only notices window resizes. Without this, its center drifts
    // from the middle of the screen, so a meetup point would be saved away
    // from the flag. pan: false keeps the map still while its edge moves.
    const resized = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resized.observe(containerRef.current);
    const placed = markers.current;
    // Frames stop while the page is hidden, so a pin can be left mid-glide;
    // on return it goes to where its friend is now
    const shown = () => {
      if (document.visibilityState === 'visible') glider.snapAll();
    };
    document.addEventListener('visibilitychange', shown);
    return () => {
      document.removeEventListener('visibilitychange', shown);
      glider.stop();
      resized.disconnect();
      map.remove();
      placed.clear();
      mapRef.current = null;
    };
  }, [glider]);

  // Add, move and remove markers to match the pins
  useEffect(() => {
    const placed = markers.current;
    const wanted = new Set(pins.map((p) => p.id));

    placed.forEach((entry, id) => {
      if (!wanted.has(id)) {
        entry.group.removeLayer(entry.marker);
        if (entry.circle) entry.group.removeLayer(entry.circle);
        placed.delete(id);
      }
    });
    glider.settle();

    pins.forEach((pin) => {
      const html = iconHtml(pin, pin.id === selectedId);
      const zIndexOffset = pin.id === selectedId ? 1000 : LAYERS[pin.kind] || 0;
      const entry = placed.get(pin.id);

      if (entry) {
        if (entry.target.lat !== pin.lat || entry.target.lng !== pin.lng) {
          entry.target = { lat: pin.lat, lng: pin.lng };
          const duration = GLIDES.has(pin.kind) && !prefersReducedMotion() ? glideDuration(entry.fixAt, pin.fixAt) : 0;
          glider.moveTo(entry, entry.target, duration);
        }
        entry.fixAt = pin.fixAt;
        syncAccuracy(entry, pin);
        if (entry.html !== html) {
          entry.marker.setIcon(iconFor(html, pin.kind));
          entry.html = html;
        }
        entry.marker.setZIndexOffset(zIndexOffset);
        if (pin.caption && entry.caption !== pin.caption) {
          entry.marker.setTooltipContent(captionNode(pin.caption));
          entry.caption = pin.caption;
        }
        return;
      }

      const marker = L.marker([pin.lat, pin.lng], {
        icon: iconFor(html, pin.kind),
        title: pin.label,
        alt: pin.label,
        keyboard: true,
        zIndexOffset,
        eventCount: pin.count || 1
      }).on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectRef.current(pin.id);
      });
      // Friends are labeled with who and how recent, without tapping
      if (pin.caption) {
        marker.bindTooltip(captionNode(pin.caption), { permanent: true, direction: 'bottom', offset: [0, 16], className: 'eb-tip' });
      }
      const group = pin.kind === 'nearby' ? clusterRef.current : layerRef.current;
      group.addLayer(marker);
      const added = { marker, html, group, caption: pin.caption, target: { lat: pin.lat, lng: pin.lng }, fixAt: pin.fixAt, glide: null, circle: null };
      syncAccuracy(added, pin);
      placed.set(pin.id, added);
    });
  }, [pins, selectedId, glider]);

  useEffect(() => {
    const map = mapRef.current;
    const { pins: current, fallbackCenter: fallback, focusId: focusOn, fitIds: only } = latest.current;
    const focus = !focused.current && current.find((p) => p.id === focusOn);
    const toFit = only ? current.filter((p) => only.includes(p.id)) : current;
    // Not animated: data arrives in steps (your events, then friends), and
    // Leaflet ignores a new view while a zoom animation is still running, so
    // an animated first fit would swallow the one that follows
    const instantly = { animate: false };
    if (focus) {
      focused.current = true;
      map.setView([focus.lat, focus.lng], MAX_FIT_ZOOM, instantly);
    } else if (toFit.length > 0) {
      map.fitBounds(L.latLngBounds(toFit.map((p) => [p.lat, p.lng])).pad(0.2), {
        ...instantly,
        maxZoom: only ? MAX_LIVE_ZOOM : MAX_FIT_ZOOM
      });
    } else if (fallback) {
      map.setView([fallback.lat, fallback.lng], 10, instantly);
    }
  }, [fitKey]);

  // Keep the selected pin on screen (a venue inside a bubble is shown by
  // zooming until its bubble splits)
  useEffect(() => {
    const entry = markers.current.get(selectedId);
    if (!entry) return;
    if (entry.group === clusterRef.current) clusterRef.current.zoomToShowLayer(entry.marker);
    else mapRef.current.panInside(entry.marker.getLatLng(), { padding: [48, 48] });
  }, [selectedId]);

  return <div ref={containerRef} className="absolute inset-0" />;
});

export default MapCanvas;
