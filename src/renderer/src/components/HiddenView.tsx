import type { CSSProperties } from 'react';

import type { PhotoDto } from '@shared/api';

import { VideoBadge } from './VideoBadge';

interface HiddenViewProps {
  photos: PhotoDto[];
  onRestore: (id: number) => void;
}

export function HiddenView({ photos, onRestore }: HiddenViewProps) {
  if (photos.length === 0) {
    return <p className="empty">No hidden photos.</p>;
  }

  return (
    <div className="grid" style={{ '--tile-size': '110px' } as CSSProperties}>
      {photos.map((photo) => (
        <div key={photo.id} className="tile">
          <img src={`app://thumb/${photo.id}`} alt="" loading="lazy" />
          <VideoBadge photo={photo} />
          <button className="restore" onClick={() => onRestore(photo.id)}>
            Restore
          </button>
        </div>
      ))}
    </div>
  );
}
