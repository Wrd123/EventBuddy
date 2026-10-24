import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
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

const iconHtml = (pin, selected) => {
  const classes = ['eb-pin', `eb-pin-${pin.kind}`, selected && 'eb-pin-selected', pin.stale && 'eb-pin-stale']
    .filter(Boolean)
    .join(' ');
  if (pin.kind === 'friend') {
    return `<div class="${classes}" style="background:${safeColor(pin.color)}">${escapeHtml(pin.initial || '?')}</div>`;
  }
  if (pin.kind === 'meetup') return `<div class="${classes}">${FLAG_SVG}</div>`;
  return `<div class="${classes}">${pin.count > 1 ? escapeHtml(pin.count) : ''}</div>`;
};

const iconFor = (html, kind) => {
  const size = SIZES[kind] || 24;
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
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

// A Leaflet map with tappable pins. Leaflet manages its own DOM, so this
// wraps it imperatively: React owns the props, Leaflet owns what's drawn.
// Pins are updated in place by id, so friends glide to new positions and
// their labels don't flicker when positions refresh.
//
// pins: [{ id, kind: 'mine' | 'nearby' | 'friend' | 'meetup' | 'me', lat, lng,
//   label, count (nearby), color + initial + caption + stale (friend) }]
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

  useImperativeHandle(ref, () => ({
    getCenter: () => {
      const { lat, lng } = mapRef.current.getCenter();
      return { lat, lng };
    }
  }));

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
    clusterRef.current = L.markerClusterGroup({
      iconCreateFunction: clusterIcon,
      showCoverageOnHover: false,
      maxClusterRadius: 45
    }).addTo(map);
    mapRef.current = map;
    const placed = markers.current;
    return () => {
      map.remove();
      placed.clear();
      mapRef.current = null;
    };
  }, []);

  // Add, move and remove markers to match the pins
  useEffect(() => {
    const placed = markers.current;
    const wanted = new Set(pins.map((p) => p.id));

    placed.forEach((entry, id) => {
      if (!wanted.has(id)) {
        entry.group.removeLayer(entry.marker);
        placed.delete(id);
      }
    });

    pins.forEach((pin) => {
      const html = iconHtml(pin, pin.id === selectedId);
      const zIndexOffset = pin.id === selectedId ? 1000 : LAYERS[pin.kind] || 0;
      const entry = placed.get(pin.id);

      if (entry) {
        const at = entry.marker.getLatLng();
        if (at.lat !== pin.lat || at.lng !== pin.lng) entry.marker.setLatLng([pin.lat, pin.lng]);
        if (entry.html !== html) {
          entry.marker.setIcon(iconFor(html, pin.kind));
          entry.html = html;
        }
        entry.marker.setZIndexOffset(zIndexOffset);
        if (pin.caption && entry.marker.getTooltip()?.getContent() !== pin.caption) {
          entry.marker.setTooltipContent(pin.caption);
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
        marker.bindTooltip(pin.caption, { permanent: true, direction: 'bottom', offset: [0, 16], className: 'eb-tip' });
      }
      const group = pin.kind === 'nearby' ? clusterRef.current : layerRef.current;
      group.addLayer(marker);
      placed.set(pin.id, { marker, html, group });
    });
  }, [pins, selectedId]);

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
