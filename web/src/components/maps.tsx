import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { LiveRow, Site } from '../../../shared/types';
import { usePublicConfig } from '../lib/auth';
import { initials } from '../lib/format';
import { t } from '../lib/i18n';
import { cx } from './ui';

// Leaflet maps (OpenStreetMap tiles by default; MAP_TILE_URL on the server can point elsewhere).
// Markers are plain HTML icons, so no image assets are needed.

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function statusColor(row: LiveRow): string {
  if (row.presence?.status === 'failed' || row.presence?.status === 'expired') return '#e11d48';
  if (row.needsReview || row.status === 'missing_checkout') return '#f59e0b';
  if (row.status === 'on_site') return '#10b981';
  if (row.status === 'checked_out') return '#94a3b8';
  return '#64748b';
}

const workerIcon = (row: LiveRow) =>
  L.divIcon({
    className: '',
    html: `<div class="worker-marker" style="background:${statusColor(row)}">${escapeHtml(initials(row.worker.name))}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

const siteIcon = (name: string) =>
  L.divIcon({
    className: '',
    html: `<div class="site-label">${escapeHtml(name)}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

const SITE_STYLE: L.CircleMarkerOptions = { color: '#0f766e', weight: 1.5, fillColor: '#14b8a6', fillOpacity: 0.1 };

/** Where to put a site's name: on the northern edge of its circle, clear of the people inside it. */
const labelPoint = (s: { lat: number; lng: number; radiusM: number }): L.LatLngTuple => [s.lat + s.radiusM / 111_320, s.lng];

function useLeaflet(container: RefObject<HTMLDivElement | null>, options: L.MapOptions = {}) {
  const config = usePublicConfig();
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // Changes whenever the container gets a real size. Maps inside dialogs start at 0×0, and fitting the
  // view before layout would leave them zoomed out to the whole world.
  const [size, setSize] = useState('0x0');
  useEffect(() => {
    const el = container.current;
    if (!el || !config || mapRef.current) return;
    const map = L.map(el, { zoomControl: true, attributionControl: true, ...options });
    L.tileLayer(config.mapTileUrl, { attribution: config.mapAttribution, maxZoom: 19 }).addTo(map);
    map.setView([20, 0], 2);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      setSize(`${el.clientWidth}x${el.clientHeight}`);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // Map options are fixed for the lifetime of a map, so only the config triggers a rebuild.
  }, [config]);
  const hasSize = size !== '0x0' && !size.startsWith('0x') && !size.endsWith('x0');
  return { mapRef, layerRef, ready: !!config && hasSize, size };
}

/** The manager's live map: workplaces and where each checked-in worker is. */
export function LiveMap({
  sites,
  rows,
  onSelect,
  className,
}: {
  sites: Site[];
  rows: LiveRow[];
  onSelect: (row: LiveRow) => void;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const { mapRef, layerRef, ready } = useLeaflet(el);
  const fitted = useRef('');
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || !ready) return;
    layer.clearLayers();
    for (const s of sites) {
      L.circle([s.lat, s.lng], { ...SITE_STYLE, radius: s.radiusM }).addTo(layer);
      L.marker(labelPoint(s), { icon: siteIcon(s.name), interactive: false, keyboard: false }).addTo(layer);
    }
    const located = rows.filter((r) => r.location);
    for (const r of located) {
      const m = L.marker([r.location!.lat, r.location!.lng], { icon: workerIcon(r), riseOnHover: true, title: r.worker.name });
      m.bindTooltip(escapeHtml(r.worker.name), { direction: 'top', offset: [0, -18] });
      m.on('click', () => onSelectRef.current(r));
      m.addTo(layer);
    }
    const key = sites.map((s) => s.id).join(',');
    if (fitted.current !== key) {
      fitted.current = key;
      const points: L.LatLngExpression[] = [
        ...sites.map((s) => [s.lat, s.lng] as L.LatLngTuple),
        ...located.map((r) => [r.location!.lat, r.location!.lng] as L.LatLngTuple),
      ];
      if (points.length) map.fitBounds(L.latLngBounds(points).pad(0.25), { maxZoom: 17 });
    }
  }, [sites, rows, ready, mapRef, layerRef]);

  // Leaflet lays out tiles and controls left-to-right; labels inside handle their own direction (styles.css).
  return (
    <div ref={el} dir="ltr" className={cx('isolate overflow-hidden rounded-2xl ring-1 ring-line', className)} role="region" aria-label={t('ui.map.label')} />
  );
}

/** A small read-only map showing one reported position and the workplace around it. */
export function MiniMap({
  point,
  site,
  className,
}: {
  point: { lat: number; lng: number; accuracy?: number | null } | null;
  site?: { lat: number; lng: number; radiusM: number; name: string } | null;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const { mapRef, layerRef, ready } = useLeaflet(el, {
    zoomControl: false,
    dragging: true,
    scrollWheelZoom: false,
    doubleClickZoom: true,
    attributionControl: true,
  });

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || !ready) return;
    layer.clearLayers();
    const bounds: L.LatLngTuple[] = [];
    if (site) {
      L.circle([site.lat, site.lng], { ...SITE_STYLE, radius: site.radiusM }).addTo(layer);
      L.marker(labelPoint(site), { icon: siteIcon(site.name), interactive: false }).addTo(layer);
      bounds.push([site.lat, site.lng]);
    }
    if (point) {
      if (point.accuracy) {
        L.circle([point.lat, point.lng], { radius: point.accuracy, color: '#0284c7', weight: 1, fillColor: '#38bdf8', fillOpacity: 0.15 }).addTo(layer);
      }
      L.circleMarker([point.lat, point.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#0284c7', fillOpacity: 1 }).addTo(layer);
      bounds.push([point.lat, point.lng]);
    }
    if (bounds.length === 1) map.setView(bounds[0]!, 16);
    else if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds).pad(0.35), { maxZoom: 17 });
  }, [point, site, ready, mapRef, layerRef]);

  return <div ref={el} className={cx('isolate overflow-hidden rounded-xl ring-1 ring-line', className)} />;
}

/** Interactive picker for a workplace: tap the map to move the pin; the circle shows the allowed area. */
export function SitePicker({
  value,
  onChange,
  others = [],
  className,
}: {
  value: { lat: number; lng: number; radiusM: number } | null;
  onChange: (v: { lat: number; lng: number }) => void;
  others?: Site[];
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const { mapRef, layerRef, ready } = useLeaflet(el, { scrollWheelZoom: true });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  /** What the view was last fitted to: 'pin', 'others' or nothing yet. */
  const fittedTo = useRef<'pin' | 'others' | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const handler = (e: L.LeafletMouseEvent) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    map.on('click', handler);
    return () => void map.off('click', handler);
  }, [ready, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || !ready) return;
    layer.clearLayers();
    for (const s of others) {
      L.circle([s.lat, s.lng], { color: '#94a3b8', weight: 1, fillOpacity: 0.05, radius: s.radiusM, interactive: false }).addTo(layer);
      L.marker(labelPoint(s), { icon: siteIcon(s.name), interactive: false }).addTo(layer);
    }
    if (value) {
      L.circle([value.lat, value.lng], { ...SITE_STYLE, radius: value.radiusM, interactive: false }).addTo(layer);
      const pin = L.marker([value.lat, value.lng], {
        draggable: true,
        icon: L.divIcon({ className: '', html: '<div class="site-pin"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      });
      pin.on('dragend', () => {
        const p = pin.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
      pin.addTo(layer);
      // Center on the pin the first time, and whenever it moves out of view (address search, "I'm here").
      if (fittedTo.current !== 'pin' || !map.getBounds().pad(-0.1).contains([value.lat, value.lng])) {
        map.setView([value.lat, value.lng], fittedTo.current === 'pin' ? Math.max(map.getZoom(), 15) : 16);
        fittedTo.current = 'pin';
      }
    } else if (fittedTo.current === null && others.length) {
      map.fitBounds(L.latLngBounds(others.map((s) => [s.lat, s.lng] as L.LatLngTuple)).pad(0.5), { maxZoom: 15 });
      fittedTo.current = 'others';
    }
  }, [value, others, ready, mapRef, layerRef]);

  return <div ref={el} className={cx('isolate overflow-hidden rounded-xl ring-1 ring-line', className)} />;
}
