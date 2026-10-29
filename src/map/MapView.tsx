import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng } from '../data/types';
import { segmentsBounds } from '../logic/geo';
import { useTheme } from '../theme/theme';
import { decimateSegmentsForRender, tileLayer, trackLineStyle } from './layers';

interface MapViewProps {
  segments: LatLng[][];
  /** false — мини-карта в карточках: без зума, драга и скролла. */
  interactive?: boolean;
  /** false — спрятать плашку атрибуции (мини-карты; attribution обязателен, но на 96×72 он закрывает карту). */
  attribution?: boolean;
  /** Подогнать вид по треку (по умолчанию да). */
  fit?: boolean;
  className?: string;
}

/** Leaflet-карта с треком: кант + изумрудная линия, старт/финиш, подложка по теме. */
export function MapView({
  segments,
  interactive = true,
  attribution = true,
  fit = true,
  className,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const linesRef = useRef<L.LayerGroup | null>(null);
  const { resolved } = useTheme();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = L.map(el, {
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      attributionControl: attribution,
    });
    mapRef.current = map;
    // Подложка одна (CyclOSM) — от темы не зависит, ставим один раз.
    const { url, attribution: attr } = tileLayer();
    tileRef.current = L.tileLayer(url, { attribution: attr, maxZoom: 19 }).addTo(map);
    linesRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      linesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- карта создаётся один раз
  }, []);

  // Трек перерисовывается при смене segments или темы.
  useEffect(() => {
    const map = mapRef.current;
    const group = linesRef.current;
    if (!map || !group) return;
    group.clearLayers();
    const style = trackLineStyle(resolved);
    const simple = decimateSegmentsForRender(segments);
    // Leaflet ждёт свои LatLng-выражения: конвертируем на границе.
    const ll = simple.map((seg) => seg.map((p) => [p.lat, p.lon] as [number, number]));
    for (const seg of ll) {
      if (seg.length < 2) continue;
      L.polyline(seg, {
        color: style.casingColor,
        weight: style.casingWeight,
        opacity: 0.9,
        lineCap: 'round',
      }).addTo(group);
    }
    for (const seg of ll) {
      if (seg.length < 2) continue;
      L.polyline(seg, {
        color: style.color,
        weight: style.weight,
        opacity: 1,
        lineCap: 'round',
      }).addTo(group);
    }
    const first = simple[0];
    if (first?.length) {
      L.circleMarker([first[0].lat, first[0].lon], {
        radius: 5,
        color: '#FFFFFF',
        weight: 2,
        fillColor: style.color,
        fillOpacity: 1,
      }).addTo(group);
      const last = first.at(-1)!;
      L.circleMarker([last.lat, last.lon], {
        radius: 5,
        color: style.color,
        weight: 2,
        fillColor: '#FFFFFF',
        fillOpacity: 1,
      }).addTo(group);
    }
    if (fit) {
      const bounds = segmentsBounds(simple);
      if (bounds) map.fitBounds(
        L.latLngBounds(
          L.latLng(bounds.minLat, bounds.minLon),
          L.latLng(bounds.maxLat, bounds.maxLon),
        ),
        { padding: [12, 12] },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- перерисовка трека
  }, [segments, resolved, fit]);

  return <div ref={containerRef} className={className} style={{ height: '100%' }} />;
}
