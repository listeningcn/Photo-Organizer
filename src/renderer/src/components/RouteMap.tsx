import L from './leaflet-global';

import { useEffect, useRef } from 'react';

import type { LatLng } from '@shared/events';
import { TILE_URL_TEMPLATE } from '@shared/network';

interface RouteMapProps {
  points: (LatLng & { id: number })[];
  home: LatLng | null;
  onOpen: (id: number) => void;
}

/** A trip's path: photo locations in time order joined by a line, plus home if set. */
export function RouteMap({ points, home, onOpen }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false });
    L.tileLayer(TILE_URL_TEMPLATE, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const line = L.polyline(
      points.map((p) => [p.lat, p.lng] as [number, number]),
      { color: '#4c6ef5', weight: 3, opacity: 0.8 }
    ).addTo(map);
    points.forEach((point, i) => {
      const isEnd = i === 0 || i === points.length - 1;
      L.circleMarker([point.lat, point.lng], {
        radius: isEnd ? 7 : 4,
        color: '#fff',
        weight: 2,
        fillColor: i === 0 ? '#2f9e44' : isEnd ? '#e03131' : '#4c6ef5',
        fillOpacity: 1,
      })
        .on('click', () => onOpenRef.current(point.id))
        .addTo(map);
    });
    if (home) {
      L.circleMarker([home.lat, home.lng], {
        radius: 6,
        color: '#fff',
        weight: 2,
        fillColor: '#868e96',
        fillOpacity: 1,
      })
        .bindTooltip('Home')
        .addTo(map);
    }
    map.fitBounds(line.getBounds(), { padding: [30, 30], maxZoom: 13 });
    return () => {
      map.remove();
    };
  }, [points, home]);

  return <div ref={containerRef} className="route-map" />;
}

interface HomeMapProps {
  home: LatLng | null;
  onPick: (home: LatLng) => void;
}

/** Click anywhere to set the home location. */
export function HomeMap({ home, onPick }: HomeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
      [20, 0],
      1
    );
    L.tileLayer(TILE_URL_TEMPLATE, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) =>
      onPickRef.current({ lat: event.latlng.lat, lng: event.latlng.wrap().lng })
    );
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.remove();
    markerRef.current = null;
    if (!home) return;
    markerRef.current = L.circleMarker([home.lat, home.lng], {
      radius: 8,
      color: '#fff',
      weight: 2,
      fillColor: '#4c6ef5',
      fillOpacity: 1,
    }).addTo(map);
    if (map.getZoom() < 9) map.setView([home.lat, home.lng], 10);
  }, [home]);

  return <div ref={containerRef} className="home-map" />;
}
