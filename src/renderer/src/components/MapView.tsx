import L from './leaflet-global';
import 'leaflet.markercluster';

import { useEffect, useRef } from 'react';

import type { PhotoDto } from '@shared/api';
import { TILE_HOST, TILE_URL_TEMPLATE } from '@shared/network';

interface MapViewProps {
  photos: PhotoDto[];
  onOpen: (id: number) => void;
}

type GeoPhoto = PhotoDto & { lat: number; lng: number };

const hasLocation = (photo: PhotoDto): photo is GeoPhoto =>
  photo.lat !== null && photo.lng !== null;

/** Resolves true if a map tile can be loaded, i.e. the online map is reachable. */
export function probeMapTiles(timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = '';
      resolve(false);
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = `https://${TILE_HOST}/0/0/0.png`;
  });
}

export function MapView({ photos, onOpen }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const geoPhotos = photos.filter(hasLocation);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, { worldCopyJump: true }).setView([20, 0], 2);
    L.tileLayer(TILE_URL_TEMPLATE, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 60,
    });
    for (const photo of geoPhotos) {
      const icon = L.divIcon({
        className: 'photo-marker',
        html: `<img src="app://thumb/${photo.id}" alt="" />`,
        iconSize: [52, 52],
      });
      const marker = L.marker([photo.lat, photo.lng], { icon });
      marker.on('click', () => onOpenRef.current(photo.id));
      cluster.addLayer(marker);
    }
    map.addLayer(cluster);

    if (geoPhotos.length > 0) {
      map.fitBounds(cluster.getBounds(), { padding: [40, 40], maxZoom: 14 });
    }

    return () => {
      map.remove();
    };
    // geoPhotos is derived from photos; rebuilding on photos is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  return (
    <div className="map-wrapper">
      <div className="map-notes">
        {geoPhotos.length === 0 && (
          <p className="map-note">None of your photos have location data.</p>
        )}
      </div>
      <div ref={containerRef} className="map" />
    </div>
  );
}
