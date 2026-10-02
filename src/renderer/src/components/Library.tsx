import { Alert, Button, Group, Progress, Tabs, Text, Tooltip } from '@mantine/core';
import {
  IconFolderPlus,
  IconLock,
  IconMap,
  IconPhoto,
  IconPlayerStop,
  IconRefresh,
  IconSettings,
  IconPlane,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ImportProgress, PhotoDto } from '@shared/api';
import {
  clusterEvents,
  DEFAULT_EVENT_OPTIONS,
  formatLatLng,
  type LatLng,
  mostCommonLocation,
  parseLatLng,
} from '@shared/events';
import { applyFilter, type LibraryFilter, NO_FILTER } from '@shared/media-filter';

import { errorMessage } from '../error-message';
import { useIdleTimeout } from '../use-idle-timeout';
import { FilterBar } from './FilterBar';
import { MapView, probeMapTiles } from './MapView';
import { SettingsView } from './SettingsView';
import { Timeline } from './Timeline';
import { TripsView } from './TripsView';
import { Viewer } from './Viewer';

type Tab = 'timeline' | 'trips' | 'map' | 'settings';

const IDLE_LOCK_MS = 10 * 60 * 1000;

interface LibraryProps {
  onLocked: () => void;
}

export function Library({ onLocked }: LibraryProps) {
  const [tab, setTab] = useState<Tab>('timeline');
  const [photos, setPhotos] = useState<PhotoDto[]>([]);
  const [hiddenPhotos, setHiddenPhotos] = useState<PhotoDto[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [mapAvailable, setMapAvailable] = useState(false);
  /** Photos the viewer steps through (timeline, map or one event) and the open index. */
  const [viewer, setViewer] = useState<{ ids: number[]; index: number } | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [home, setHome] = useState<LatLng | null>(null);
  const [gapHours, setGapHours] = useState(DEFAULT_EVENT_OPTIONS.gapHours);
  const [tripKm, setTripKm] = useState(DEFAULT_EVENT_OPTIONS.tripKm);
  const [titles, setTitles] = useState<Record<string, string>>({});
  // In-memory only: the filter resets when the library is locked.
  const [filter, setFilter] = useState<LibraryFilter>(NO_FILTER);

  /** What Timeline, Trips and Map show. */
  const shownPhotos = useMemo(() => applyFilter(photos, filter), [photos, filter]);
  const photosById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const events = useMemo(
    () => clusterEvents(shownPhotos, { home, gapHours, tripKm }),
    [shownPhotos, home, gapHours, tripKm]
  );
  const suggestedHome = useMemo(() => mostCommonLocation(photos), [photos]);
  const viewerPhotos = useMemo(
    () =>
      viewer?.ids.map((id) => photosById.get(id)).filter((p): p is PhotoDto => !!p) ?? [],
    [viewer, photosById]
  );

  useEffect(() => {
    Promise.all([
      window.api.getPreference('events.home'),
      window.api.getPreference('events.gapHours'),
      window.api.getPreference('events.tripKm'),
      window.api.getEventTitles(),
    ])
      .then(([savedHome, savedGap, savedTripKm, savedTitles]) => {
        setHome(parseLatLng(savedHome));
        const gap = Number(savedGap);
        if (savedGap !== null && gap >= 2 && gap <= 24) setGapHours(gap);
        const km = Number(savedTripKm);
        if (savedTripKm !== null && savedTripKm !== '' && km >= 0 && km <= 100)
          setTripKm(km);
        setTitles(savedTitles);
      })
      .catch(() => undefined);
  }, []);

  const changeHome = (next: LatLng | null) => {
    setHome(next);
    window.api
      .setPreference('events.home', next ? formatLatLng(next) : '')
      .catch((err) => setError(errorMessage(err)));
  };

  const changeGapHours = (hours: number) => {
    setGapHours(hours);
    window.api
      .setPreference('events.gapHours', String(hours))
      .catch((err) => setError(errorMessage(err)));
  };

  const changeTripKm = (km: number) => {
    setTripKm(km);
    window.api
      .setPreference('events.tripKm', String(km))
      .catch((err) => setError(errorMessage(err)));
  };

  const renameEvent = async (key: string, title: string) => {
    try {
      await window.api.setEventTitle(key, title);
      setTitles(await window.api.getEventTitles());
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const reload = useCallback(async () => {
    const [visible, hidden, folderList] = await Promise.all([
      window.api.listPhotos(false),
      window.api.listPhotos(true),
      window.api.listFolders(),
    ]);
    setPhotos(visible);
    setHiddenPhotos(hidden);
    setFolders(folderList);
  }, []);

  useEffect(() => {
    reload().catch((err) => setError(errorMessage(err)));
    return window.api.onImportProgress(setProgress);
  }, [reload]);

  // Show the Map tab only when map tiles can actually be loaded.
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      probeMapTiles().then((ok) => {
        if (!cancelled) setMapAvailable(ok);
      });
    const offline = () => setMapAvailable(false);
    check();
    window.addEventListener('online', check);
    window.addEventListener('offline', offline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', check);
      window.removeEventListener('offline', offline);
    };
  }, []);

  useEffect(() => {
    if (!mapAvailable && tab === 'map') setTab('timeline');
  }, [mapAvailable, tab]);

  const lock = useCallback(async () => {
    await window.api.lock();
    onLocked();
  }, [onLocked]);

  // A long import shouldn't be killed by auto-lock; the idle timer restarts when it ends.
  useIdleTimeout(IDLE_LOCK_MS, lock, progress !== null && !progress.done);

  const runImport = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStopping(false);
    }
  };

  const handleHide = async (id: number, password: string) => {
    await window.api.hidePhoto(id, password);
    setViewer((current) => {
      if (!current) return null;
      const ids = current.ids.filter((other) => other !== id);
      if (ids.length === 0) return null;
      return { ids, index: Math.min(current.index, ids.length - 1) };
    });
    await reload();
  };

  const handleRestore = async (id: number) => {
    await window.api.restorePhoto(id);
    await reload();
  };

  const openIn = (ids: number[], id: number) => {
    const index = ids.indexOf(id);
    if (index >= 0) setViewer({ ids, index });
  };
  const openPhoto = (id: number) =>
    openIn(
      shownPhotos.map((photo) => photo.id),
      id
    );

  const importing = progress !== null && !progress.done;
  const percent =
    progress && progress.total > 0 ? (progress.scanned / progress.total) * 100 : 0;

  return (
    <div className="library">
      <Tabs
        value={tab}
        onChange={(value) => value && setTab(value as Tab)}
        keepMounted={false}
        className="library-tabs"
      >
        <header className="toolbar">
          <Group gap="xs" wrap="nowrap" className="brand">
            <img src="./icon.svg" alt="" width={26} height={26} />
            <Text fw={700}>Photos</Text>
          </Group>
          <Tabs.List className="tab-list">
            <Tabs.Tab value="timeline" leftSection={<IconPhoto size={16} />}>
              Timeline
            </Tabs.Tab>
            <Tabs.Tab value="trips" leftSection={<IconPlane size={16} />}>
              Trips & events
            </Tabs.Tab>
            {mapAvailable && (
              <Tabs.Tab value="map" leftSection={<IconMap size={16} />}>
                Map
              </Tabs.Tab>
            )}
            <Tabs.Tab value="settings" leftSection={<IconSettings size={16} />}>
              Settings
            </Tabs.Tab>
          </Tabs.List>
          <Group gap="xs" wrap="nowrap" className="actions">
            <Tooltip label="Rescan all folders">
              <Button
                variant="default"
                size="xs"
                leftSection={<IconRefresh size={14} />}
                disabled={importing}
                onClick={() => runImport(() => window.api.rescan())}
              >
                Rescan
              </Button>
            </Tooltip>
            <Button
              size="xs"
              leftSection={<IconFolderPlus size={14} />}
              loading={importing}
              onClick={() => runImport(() => window.api.addFolder())}
            >
              Add folder
            </Button>
            <Tooltip label="Lock library">
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                leftSection={<IconLock size={14} />}
                onClick={lock}
              >
                Lock
              </Button>
            </Tooltip>
          </Group>
        </header>

        {progress && (
          <div className="import-status" aria-live="polite">
            {!progress.done && (
              <Group gap="sm" wrap="nowrap">
                <Progress
                  style={{ flex: 1 }}
                  value={progress.total ? percent : 100}
                  animated={!progress.total}
                  striped={!progress.total}
                  size="sm"
                  radius="xl"
                />
                <Button
                  size="compact-xs"
                  variant="light"
                  color="red"
                  leftSection={<IconPlayerStop size={12} />}
                  loading={stopping}
                  onClick={() => {
                    setStopping(true);
                    window.api.cancelImport().catch((err) => {
                      setStopping(false);
                      setError(errorMessage(err));
                    });
                  }}
                >
                  Stop
                </Button>
              </Group>
            )}
            {progress.unavailable ? (
              <Text size="xs" c="yellow" mt={4}>
                Skipped {progress.folder}: folder not reachable (is the drive connected?).
                Its photos were left as they are.
              </Text>
            ) : (
              <Text size="xs" c="dimmed" mt={4}>
                {progress.cancelled
                  ? 'Stopped'
                  : stopping
                    ? 'Stopping…'
                    : progress.done
                      ? 'Done'
                      : progress.total
                        ? 'Importing'
                        : 'Scanning'}{' '}
                {progress.scanned}/{progress.total}
                {progress.total > 0 && ` (${Math.floor(percent)}%)`} · {progress.imported}{' '}
                new · {progress.unchanged} unchanged · {progress.relinked} moved ·{' '}
                {progress.duplicates} duplicates · {progress.failed} failed
              </Text>
            )}
          </div>
        )}

        {error && (
          <Alert
            color="red"
            variant="light"
            m="sm"
            withCloseButton
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}

        {tab !== 'settings' && photos.length > 0 && (
          <FilterBar
            photos={photos}
            filter={filter}
            shown={shownPhotos.length}
            onChange={setFilter}
          />
        )}

        <main className="content">
          <Tabs.Panel value="timeline">
            {shownPhotos.length === 0 && photos.length > 0 ? (
              <p className="empty">Nothing matches the filter.</p>
            ) : (
              <Timeline photos={shownPhotos} onOpen={openPhoto} />
            )}
          </Tabs.Panel>
          <Tabs.Panel value="trips">
            <TripsView
              events={events}
              photosById={photosById}
              titles={titles}
              home={home}
              mapAvailable={mapAvailable}
              onOpen={openIn}
              onRename={renameEvent}
              onSetHome={() => setTab('settings')}
            />
          </Tabs.Panel>
          {mapAvailable && (
            <Tabs.Panel value="map" h="100%">
              <MapView photos={shownPhotos} onOpen={openPhoto} />
            </Tabs.Panel>
          )}
          <Tabs.Panel value="settings">
            <SettingsView
              hiddenPhotos={hiddenPhotos}
              onRestore={handleRestore}
              folders={folders}
              busy={importing}
              home={home}
              suggestedHome={suggestedHome}
              onHomeChange={changeHome}
              gapHours={gapHours}
              onGapHoursChange={changeGapHours}
              tripKm={tripKm}
              onTripKmChange={changeTripKm}
              mapAvailable={mapAvailable}
              onRemoveFolder={async (folder) => {
                try {
                  await window.api.removeFolder(folder);
                  await reload();
                } catch (err) {
                  setError(errorMessage(err));
                }
              }}
            />
          </Tabs.Panel>
        </main>
      </Tabs>

      {viewer !== null && viewerPhotos.length > 0 && (
        <Viewer
          photos={viewerPhotos}
          index={Math.min(viewer.index, viewerPhotos.length - 1)}
          onIndexChange={(index) => setViewer({ ids: viewer.ids, index })}
          mapAvailable={mapAvailable}
          onClose={() => setViewer(null)}
          onHide={handleHide}
        />
      )}
    </div>
  );
}
