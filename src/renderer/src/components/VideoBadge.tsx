import { IconPlayerPlayFilled } from '@tabler/icons-react';

import type { PhotoDto } from '@shared/api';
import { formatDuration } from '@shared/photo-details';

/** Overlay for video tiles: a centred play icon plus the length in the corner. */
export function VideoBadge({ photo }: { photo: PhotoDto }) {
  if (photo.mediaType !== 'video') return null;
  return (
    <>
      <span className="video-play" aria-hidden>
        <IconPlayerPlayFilled size={20} />
      </span>
      {photo.duration !== null && (
        <span className="video-badge">{formatDuration(photo.duration)}</span>
      )}
    </>
  );
}
