import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconCalendarEvent,
  IconHome,
  IconPencil,
  IconPlane,
} from '@tabler/icons-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { PhotoDto } from '@shared/api';
import {
  daysOf,
  formatDateRange,
  type LatLng,
  type PhotoEvent,
  routeOf,
} from '@shared/events';

import { RouteMap } from './RouteMap';
import { ScrollDate, useScrollLabel } from './ScrollDate';
import { VideoBadge } from './VideoBadge';

const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
});

interface TripsViewProps {
  events: PhotoEvent[];
  photosById: Map<number, PhotoDto>;
  titles: Record<string, string>;
  home: LatLng | null;
  mapAvailable: boolean;
  onOpen: (ids: number[], id: number) => void;
  onRename: (key: string, title: string) => Promise<void>;
  onSetHome: () => void;
}

type Filter = 'all' | 'trip' | 'event';

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const kmFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function autoTitle(event: PhotoEvent): string {
  const range = formatDateRange(event.start, event.end);
  return event.kind === 'trip' ? `Trip · ${range}` : range;
}

/** Prefers a landscape photo for the cover, since cards are wider than tall. */
function coverOf(event: PhotoEvent, photosById: Map<number, PhotoDto>): number {
  const landscape = event.photoIds.find((id) => {
    const p = photosById.get(id);
    return p && p.width && p.height && p.width >= p.height;
  });
  return landscape ?? event.photoIds[0];
}

function countLabel(event: PhotoEvent, photosById: Map<number, PhotoDto>): string {
  let videos = 0;
  for (const id of event.photoIds)
    if (photosById.get(id)?.mediaType === 'video') videos++;
  const photos = event.photoIds.length - videos;
  return [
    photos > 0 && `${photos} photo${photos === 1 ? '' : 's'}`,
    videos > 0 && `${videos} video${videos === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function TripsView(props: TripsViewProps) {
  const { events, photosById, titles, home, onSetHome } = props;
  const [filter, setFilter] = useState<Filter>('all');
  const [year, setYear] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const years = useMemo(
    () => [...new Set(events.map((e) => String(new Date(e.start).getFullYear())))],
    [events]
  );
  const visible = events.filter(
    (e) =>
      (filter === 'all' || e.kind === filter) &&
      (year === null || String(new Date(e.start).getFullYear()) === year)
  );
  const open = openKey ? events.find((e) => e.key === openKey) : undefined;
  const listRef = useRef<HTMLDivElement>(null);
  const scroll = useScrollLabel(listRef, [visible.length, filter, year, openKey]);
  /** List scroll position, restored when coming back from a trip. */
  const savedScroll = useRef(0);

  const scroller = () => document.querySelector<HTMLElement>('.content');
  const openEvent = (key: string) => {
    savedScroll.current = scroller()?.scrollTop ?? 0;
    setOpenKey(key);
  };

  // Trip opens at the top (title and map); the list returns to where it was.
  useLayoutEffect(() => {
    const element = scroller();
    if (element) element.scrollTop = openKey ? 0 : savedScroll.current;
  }, [openKey]);

  // The open event can disappear after a rescan or a home change.
  useEffect(() => {
    if (openKey && !open) setOpenKey(null);
  }, [openKey, open]);

  if (open) {
    return <TripDetail {...props} event={open} onBack={() => setOpenKey(null)} />;
  }

  return (
    <Stack p="lg" gap="md" ref={listRef}>
      <ScrollDate {...scroll} />
      {!home && (
        <Alert color="blue" variant="light" icon={<IconHome size={18} />}>
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">
              Set your home location to tell trips apart from events at home.
            </Text>
            <Button size="xs" variant="light" onClick={onSetHome}>
              Set home
            </Button>
          </Group>
        </Alert>
      )}
      <Group gap="sm">
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={(value) => setFilter(value as Filter)}
          data={[
            { value: 'all', label: 'All' },
            { value: 'trip', label: 'Trips' },
            { value: 'event', label: 'Events' },
          ]}
        />
        <Select
          size="xs"
          w={110}
          placeholder="All years"
          clearable
          data={years}
          value={year}
          onChange={setYear}
          aria-label="Year"
        />
        <Text size="xs" c="dimmed">
          {visible.length} {visible.length === 1 ? 'item' : 'items'}
        </Text>
      </Group>

      {visible.length === 0 ? (
        <Text c="dimmed">
          No{' '}
          {filter === 'trip'
            ? 'trips'
            : filter === 'event'
              ? 'events'
              : 'events or trips'}{' '}
          found.
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="md">
          {visible.map((event) => (
            <Card
              key={event.key}
              withBorder
              radius="md"
              padding={0}
              component="button"
              className="event-card"
              data-label={monthFormatter.format(event.start)}
              onClick={() => openEvent(event.key)}
            >
              <img
                src={`app://thumb/${coverOf(event, photosById)}`}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <Stack gap={2} p="sm" align="flex-start">
                <Group gap={6} wrap="nowrap" w="100%">
                  <Text fw={600} truncate style={{ flex: 1, textAlign: 'left' }}>
                    {titles[event.key] ?? autoTitle(event)}
                  </Text>
                  <KindBadge event={event} />
                </Group>
                <Text size="xs" c="dimmed">
                  {titles[event.key] && `${formatDateRange(event.start, event.end)} · `}
                  {countLabel(event, photosById)}
                </Text>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}

function KindBadge({ event }: { event: PhotoEvent }) {
  return event.kind === 'trip' ? (
    <Badge size="sm" variant="light" leftSection={<IconPlane size={11} />}>
      Trip
    </Badge>
  ) : (
    <Badge
      size="sm"
      variant="light"
      color="gray"
      leftSection={<IconCalendarEvent size={11} />}
    >
      Event
    </Badge>
  );
}

interface TripDetailProps extends TripsViewProps {
  event: PhotoEvent;
  onBack: () => void;
}

function TripDetail({
  event,
  photosById,
  titles,
  home,
  mapAvailable,
  onOpen,
  onRename,
  onBack,
}: TripDetailProps) {
  const title = titles[event.key] ?? autoTitle(event);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  const photos = useMemo(
    () =>
      event.photoIds.map((id) => photosById.get(id)).filter((p): p is PhotoDto => !!p),
    [event, photosById]
  );
  const days = useMemo(() => daysOf(photos), [photos]);
  const route = useMemo(() => routeOf(photos), [photos]);
  const open = (id: number) => onOpen(event.photoIds, id);
  const rootRef = useRef<HTMLDivElement>(null);
  const scroll = useScrollLabel(rootRef, [days]);

  const save = async () => {
    setEditing(false);
    if (draft.trim() !== title)
      await onRename(event.key, draft === autoTitle(event) ? '' : draft);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing && !document.querySelector('.viewer')) onBack();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [editing, onBack]);

  return (
    <Stack p="lg" gap="md" className="trip-detail" ref={rootRef}>
      <ScrollDate {...scroll} />
      <Group gap="xs" wrap="nowrap" className="trip-header">
        <ActionIcon
          variant="subtle"
          color="gray"
          onClick={onBack}
          aria-label="Back to trips"
        >
          <IconArrowLeft size={18} />
        </ActionIcon>
        {editing ? (
          <TextInput
            autoFocus
            style={{ flex: 1 }}
            maxLength={100}
            value={draft}
            placeholder={autoTitle(event)}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setDraft(title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <>
            <Title order={3} style={{ flex: 1 }} lineClamp={1}>
              {title}
            </Title>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="Rename"
              onClick={() => {
                setDraft(title);
                setEditing(true);
              }}
            >
              <IconPencil size={16} />
            </ActionIcon>
          </>
        )}
        <KindBadge event={event} />
      </Group>
      <Text size="sm" c="dimmed" mt={-8}>
        {formatDateRange(event.start, event.end)} · {days.length}{' '}
        {days.length === 1 ? 'day' : 'days'} · {countLabel(event, photosById)}
        {event.distanceKm !== null &&
          event.kind === 'trip' &&
          ` · ${kmFormatter.format(event.distanceKm)} km from home`}
      </Text>

      {mapAvailable && route.length > 0 && (
        <RouteMap
          points={route}
          home={event.kind === 'trip' ? home : null}
          onOpen={open}
        />
      )}

      {days.map((day) => (
        <section
          key={day.day}
          className="group"
          data-label={`${days.length > 1 ? `Day ${day.index} · ` : ''}${dayFormatter.format(
            photosById.get(day.photoIds[0])!.takenAt!
          )}`}
        >
          <h2>
            {days.length > 1 && `Day ${day.index} · `}
            {dayFormatter.format(photosById.get(day.photoIds[0])!.takenAt!)}{' '}
            <span className="muted">{day.photoIds.length}</span>
          </h2>
          <div className="grid">
            {day.photoIds.map((id) => {
              const photo = photosById.get(id)!;
              return (
                <button key={id} className="tile" onClick={() => open(id)}>
                  <img src={`app://thumb/${id}`} alt="" loading="lazy" decoding="async" />
                  {photo.missing && <span className="badge">Missing</span>}
                  <VideoBadge photo={photo} />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </Stack>
  );
}
