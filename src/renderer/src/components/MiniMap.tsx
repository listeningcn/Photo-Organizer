import L from './leaflet-global';

import { useEffect, useRef } from 'react';

import { TILE_URL_TEMPLATE } from '@shared/network';

interface MiniMapProps {
  lat: number;
  lng: number;
}

/** Small non-interactive-by-default map showing where a photo was taken. */
export function MiniMap({ lat, lng }: MiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    });
    L.tileLayer(TILE_URL_TEMPLATE, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    mapRef.current = map;
    markerRef.current = L.circleMarker([0, 0], {
      radius: 8,
      color: '#fff',
      weight: 2,
      fillColor: '#4c6ef5',
      fillOpacity: 1,
    }).addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Reuse the same map while stepping through photos instead of rebuilding it.
  useEffect(() => {
    mapRef.current?.setView([lat, lng], 13);
    markerRef.current?.setLatLng([lat, lng]);
  }, [lat, lng]);

  return <div ref={containerRef} className="mini-map" />;
}
