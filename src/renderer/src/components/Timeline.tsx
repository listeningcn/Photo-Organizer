import { ActionIcon, Group, SegmentedControl, Slider, Tooltip } from '@mantine/core';
import { IconZoomIn, IconZoomOut } from '@tabler/icons-react';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { modKey } from '@shared/paths';
import { createWheelStepper } from '@shared/wheel-stepper';

import { ScrollDate, useScrollLabel } from './ScrollDate';
import { VideoBadge } from './VideoBadge';

const MOD = modKey(window.api.platform);

import type { PhotoDto } from '@shared/api';
import { type GroupBy, groupPhotos } from '@shared/grouping';

interface TimelineProps {
  photos: PhotoDto[];
  onOpen: (id: number) => void;
  /** Where the grouping and zoom controls go (the filter row). */
  toolbarSlot: HTMLElement | null;
}

const MIN_TILE = 32;
const MAX_TILE = 400;
const DEFAULT_TILE = 150;
const ZOOM_STEP = 1.15;
const SAVE_DELAY_MS = 400;

const clampTile = (size: number) =>
  Math.round(Math.min(MAX_TILE, Math.max(MIN_TILE, size)));

export function Timeline({ photos, onOpen, toolbarSlot }: TimelineProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [tileSize, setTileSize] = useState(DEFAULT_TILE);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupPhotos(photos, groupBy), [photos, groupBy]);

  // Preferences live in the encrypted database, not browser storage.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.api.getPreference('timeline.tileSize'),
      window.api.getPreference('timeline.groupBy'),
    ])
      .then(([size, group]) => {
        if (cancelled) return;
        const saved = Number(size);
        if (size !== null && Number.isFinite(saved) && saved > 0)
          setTileSize(clampTile(saved));
        if (group === 'month' || group === 'year') setGroupBy(group);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setPrefsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    // Debounced: dragging the slider fires many changes.
    const timer = setTimeout(() => {
      window.api
        .setPreference('timeline.tileSize', String(tileSize))
        .catch(() => undefined);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [tileSize, prefsLoaded]);

  useEffect(() => {
    if (!prefsLoaded) return;
    window.api.setPreference('timeline.groupBy', groupBy).catch(() => undefined);
  }, [groupBy, prefsLoaded]);

  // Ctrl/Cmd + wheel and Ctrl/Cmd + (+ / - / 0) zoom the grid.
  useEffect(() => {
    const root = rootRef.current;
    const scroller = root?.closest<HTMLElement>('.content') ?? root;
    if (!scroller) return;

    // One zoom level per scroll gesture, however many wheel events it produces.
    const step = createWheelStepper((direction) =>
      setTileSize((size) =>
        clampTile(direction > 0 ? size * ZOOM_STEP : size / ZOOM_STEP)
      )
    );
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      step(event.deltaY, event.timeStamp);
    };
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key === '=' || event.key === '+') {
        setTileSize((size) => clampTile(size * ZOOM_STEP));
      } else if (event.key === '-') {
        setTileSize((size) => clampTile(size / ZOOM_STEP));
      } else if (event.key === '0') {
        setTileSize(DEFAULT_TILE);
      } else {
        return;
      }
      event.preventDefault();
    };

    scroller.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [photos.length]);

  // Track which group is at the top of the viewport and show it while scrolling.
  const { label: currentLabel, scrolling } = useScrollLabel(rootRef, [groups]);

  if (photos.length === 0) {
    return (
      <p className="empty">No photos yet. Use Settings → “Add folder” to import some.</p>
    );
  }

  return (
    <div
      ref={rootRef}
      className="timeline"
      style={
        {
          '--tile-size': `${tileSize}px`,
          '--tile-gap': `${tileSize < 80 ? 1 : tileSize < 140 ? 2 : 4}px`,
        } as CSSProperties
      }
    >
      <ScrollDate label={currentLabel} scrolling={scrolling} />
      {toolbarSlot &&
        createPortal(
          <div className="timeline-toolbar">
            <SegmentedControl
              size="xs"
              value={groupBy}
              onChange={(value) => setGroupBy(value as GroupBy)}
              data={[
                { value: 'month', label: 'By month' },
                { value: 'year', label: 'By year' },
              ]}
            />
            <Group gap={6} wrap="nowrap" className="zoom-control">
              <Tooltip label={`Zoom out (${MOD} − or ${MOD} + scroll)`}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label="Zoom out"
                  onClick={() => setTileSize((size) => clampTile(size / ZOOM_STEP))}
                >
                  <IconZoomOut size={18} />
                </ActionIcon>
              </Tooltip>
              <Slider
                w={160}
                size="sm"
                min={MIN_TILE}
                max={MAX_TILE}
                value={tileSize}
                onChange={(value) => setTileSize(clampTile(value))}
                label={null}
                aria-label="Thumbnail size"
              />
              <Tooltip label={`Zoom in (${MOD} + or ${MOD} + scroll)`}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label="Zoom in"
                  onClick={() => setTileSize((size) => clampTile(size * ZOOM_STEP))}
                >
                  <IconZoomIn size={18} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </div>,
          toolbarSlot
        )}

      {groups.map((group) => (
        <section key={group.key} className="group" data-label={group.label}>
          <h2>
            {group.label} <span className="muted">{group.photos.length}</span>
          </h2>
          <div className="grid">
            {group.photos.map((photo) => (
              <button
                key={photo.id}
                className="tile"
                onClick={() => onOpen(photo.id)}
                title={photo.path}
              >
                <img
                  src={`app://thumb/${photo.id}`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                {photo.missing && <span className="badge">Missing</span>}
                <VideoBadge photo={photo} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
