import { fileNameOf } from '@shared/paths';
import { Button, Divider, Group, Skeleton, Text } from '@mantine/core';
import {
  IconAperture,
  IconCalendar,
  IconCamera,
  IconFile,
  IconEyeOff,
  IconMapPin,
} from '@tabler/icons-react';
import { type ReactNode, useEffect, useState } from 'react';

import type { PhotoDto } from '@shared/api';
import {
  exposureSummary,
  formatAperture,
  formatBytes,
  formatDuration,
  formatExposureBias,
  formatExposureTime,
  formatMegapixels,
  type PhotoDetails,
} from '@shared/photo-details';

import { MiniMap } from './MiniMap';
import { PasswordDialog } from './PasswordDialog';

interface ViewerProps {
  photos: PhotoDto[];
  index: number;
  mapAvailable: boolean;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onHide: (id: number, password: string) => Promise<void>;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'full',
  timeStyle: 'short',
});

type Row = [label: string, value: ReactNode | null | undefined];

function Section({ icon, title, rows }: { icon: ReactNode; title: string; rows: Row[] }) {
  const visible = rows.filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  );
  if (visible.length === 0) return null;
  return (
    <section className="viewer-section">
      <Group gap={6} mb={4}>
        {icon}
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          {title}
        </Text>
      </Group>
      <dl>
        {visible.map(([label, value]) => (
          <div key={label} className="viewer-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function Viewer({
  photos,
  index,
  mapAvailable,
  onIndexChange,
  onClose,
  onHide,
}: ViewerProps) {
  const [confirmingHide, setConfirmingHide] = useState(false);
  const [details, setDetails] = useState<PhotoDetails | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const photo = photos[index];
  const photoId = photo?.id;

  useEffect(() => {
    setVideoFailed(false);
  }, [photoId]);

  useEffect(() => {
    if (photoId === undefined) return;
    let cancelled = false;
    setDetails(null);
    window.api
      .photoDetails(photoId)
      .then((result) => {
        if (!cancelled) setDetails(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (confirmingHide) return;
      if (event.key === 'Escape') onClose();
      // Arrow keys seek while the video player has focus.
      if (event.target instanceof HTMLVideoElement) return;
      if (event.key === 'ArrowRight' && index < photos.length - 1)
        onIndexChange(index + 1);
      if (event.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [confirmingHide, index, photos.length, onClose, onIndexChange]);

  if (!photo) return null;

  return (
    <div className="viewer" role="dialog" aria-modal aria-label="Photo viewer">
      <div className="viewer-image">
        <button
          className="nav prev"
          aria-label="Previous photo"
          disabled={index === 0}
          onClick={() => onIndexChange(index - 1)}
        >
          ‹
        </button>
        {photo.mediaType === 'video' && !photo.missing && !videoFailed ? (
          <video
            key={photo.id}
            src={`app://video/${photo.id}`}
            poster={`app://preview/${photo.id}`}
            controls
            autoPlay
            playsInline
            onError={() => setVideoFailed(true)}
          />
        ) : (
          <img src={`app://preview/${photo.id}`} alt="" />
        )}
        {photo.mediaType === 'video' && (photo.missing || videoFailed) && (
          <Text className="viewer-video-note" size="sm">
            {photo.missing
              ? 'The original video is not available. Showing a still frame.'
              : "This video format can't be played here. Showing a still frame."}
          </Text>
        )}
        <button
          className="nav next"
          aria-label="Next photo"
          disabled={index === photos.length - 1}
          onClick={() => onIndexChange(index + 1)}
        >
          ›
        </button>
      </div>

      <aside className="viewer-info">
        <button className="close" aria-label="Close viewer" onClick={onClose}>
          ✕
        </button>
        <Text fw={600} size="lg" pr={32} className="viewer-title">
          {details?.fileName ?? fileNameOf(photo.path)}
        </Text>
        <Text size="sm" c="dimmed" mb="sm">
          {photo.takenAt ? dateFormatter.format(photo.takenAt) : 'Date unknown'}
          {details?.timeZone && ` (UTC${details.timeZone})`}
        </Text>
        {details && exposureSummary(details) && (
          <Text size="sm" ff="monospace" mb="sm">
            {exposureSummary(details)}
          </Text>
        )}

        {photo.lat !== null && photo.lng !== null && (
          <>
            {mapAvailable && <MiniMap lat={photo.lat} lng={photo.lng} />}
            <Section
              icon={<IconMapPin size={14} />}
              title="Location"
              rows={[
                ['Place', photo.place],
                ['Coordinates', `${photo.lat.toFixed(5)}, ${photo.lng.toFixed(5)}`],
                [
                  'Altitude',
                  details?.altitude != null ? `${Math.round(details.altitude)} m` : null,
                ],
                [
                  'Direction',
                  details?.direction != null ? `${Math.round(details.direction)}°` : null,
                ],
              ]}
            />
          </>
        )}

        {details === null ? (
          <Skeleton height={120} mt="sm" radius="md" />
        ) : (
          <>
            <Section
              icon={<IconCamera size={14} />}
              title="Camera"
              rows={[
                [
                  'Camera',
                  [details.make, details.model].filter(Boolean).join(' ') || photo.camera,
                ],
                ['Lens', details.lens],
                ['Software', details.software],
              ]}
            />
            <Section
              icon={<IconAperture size={14} />}
              title="Exposure"
              rows={[
                ['Aperture', details.fNumber ? formatAperture(details.fNumber) : null],
                [
                  'Shutter',
                  details.exposureTime ? formatExposureTime(details.exposureTime) : null,
                ],
                ['ISO', details.iso],
                [
                  'Focal length',
                  details.focalLength
                    ? `${Number(details.focalLength.toFixed(1))} mm${
                        details.focalLength35
                          ? ` (${details.focalLength35} mm equiv.)`
                          : ''
                      }`
                    : null,
                ],
                [
                  'Exposure bias',
                  details.exposureBias !== null
                    ? formatExposureBias(details.exposureBias)
                    : null,
                ],
                ['Program', details.exposureProgram],
                ['Metering', details.meteringMode],
                ['Flash', details.flash],
                ['White balance', details.whiteBalance],
              ]}
            />
            <Section
              icon={<IconCalendar size={14} />}
              title="Info"
              rows={[
                ['Description', details.description],
                ['Artist', details.artist],
                ['Copyright', details.copyright],
              ]}
            />
          </>
        )}

        <Section
          icon={<IconFile size={14} />}
          title="File"
          rows={[
            [
              'Dimensions',
              photo.width && photo.height
                ? `${photo.width} × ${photo.height} (${formatMegapixels(photo.width, photo.height)})`
                : null,
            ],
            ['Duration', photo.duration !== null ? formatDuration(photo.duration) : null],
            ['Format', details?.format],
            [
              'File size',
              details?.fileSize != null ? formatBytes(details.fileSize) : null,
            ],
            ['Color space', details?.colorSpace],
            [
              'Modified',
              details?.fileModified != null
                ? dateFormatter.format(details.fileModified)
                : null,
            ],
            [
              'Path',
              <span className="path" key="path">
                {photo.path}
                {photo.missing && <span className="badge inline">Missing</span>}
              </span>,
            ],
          ]}
        />

        <Divider my="md" />
        {photo.hiddenAt === null && (
          <Button
            fullWidth
            mt="md"
            variant="light"
            color="gray"
            leftSection={<IconEyeOff size={16} />}
            onClick={() => setConfirmingHide(true)}
          >
            Hide photo
          </Button>
        )}
      </aside>

      {confirmingHide && (
        <PasswordDialog
          title="Hide this photo?"
          description="The photo will be removed from Timeline, Trips and Map. The original file on disk is never touched. You can restore it anytime from Settings → Hidden photos."
          confirmLabel="Hide"
          onCancel={() => setConfirmingHide(false)}
          onConfirm={async (password) => {
            await onHide(photo.id, password);
            setConfirmingHide(false);
          }}
        />
      )}
    </div>
  );
}
