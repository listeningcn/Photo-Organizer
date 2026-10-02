import { Button, Group, MultiSelect, SegmentedControl, Text } from '@mantine/core';
import { IconFilterOff } from '@tabler/icons-react';
import { useMemo } from 'react';

import type { PhotoDto } from '@shared/api';
import {
  formatCounts,
  isFiltering,
  type LibraryFilter,
  type MediaFilter,
  NO_FILTER,
} from '@shared/media-filter';

interface FilterBarProps {
  photos: PhotoDto[];
  filter: LibraryFilter;
  shown: number;
  onChange: (filter: LibraryFilter) => void;
  /** Receives the element where the active tab puts its own controls, on the same row. */
  slotRef: (element: HTMLDivElement | null) => void;
}

/** Media type (All / Photos / Videos) and format filter, applied to Timeline, Trips and Map. */
export function FilterBar({ photos, filter, shown, onChange, slotRef }: FilterBarProps) {
  const counts = useMemo(() => formatCounts(photos), [photos]);
  const videos = useMemo(
    () => photos.filter((p) => p.mediaType === 'video').length,
    [photos]
  );

  // Only offer formats that fit the chosen media type.
  const formatOptions = counts
    .filter((c) => filter.media === 'all' || c.mediaType === filter.media)
    .map((c) => ({ value: c.format, label: `${c.format} (${c.count})` }));

  const setMedia = (media: MediaFilter) => {
    const allowed = new Set(
      counts.filter((c) => media === 'all' || c.mediaType === media).map((c) => c.format)
    );
    onChange({ media, formats: filter.formats.filter((f) => allowed.has(f)) });
  };

  return (
    <Group gap="sm" className="filter-bar" wrap="nowrap">
      <SegmentedControl
        size="xs"
        value={filter.media}
        onChange={(value) => setMedia(value as MediaFilter)}
        data={[
          { value: 'all', label: `All (${photos.length})` },
          { value: 'photo', label: `Photos (${photos.length - videos})` },
          { value: 'video', label: `Videos (${videos})` },
        ]}
      />
      <MultiSelect
        size="xs"
        w={260}
        placeholder={filter.formats.length ? undefined : 'All formats'}
        data={formatOptions}
        value={filter.formats}
        onChange={(formats) => onChange({ ...filter, formats })}
        clearable
        searchable
        hidePickedOptions
        maxDropdownHeight={280}
        aria-label="Formats"
        comboboxProps={{ withinPortal: true }}
      />
      {isFiltering(filter) && (
        <>
          <Text size="xs" c="dimmed">
            Showing {shown} of {photos.length}
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            leftSection={<IconFilterOff size={12} />}
            onClick={() => onChange(NO_FILTER)}
          >
            Clear
          </Button>
        </>
      )}
      <div ref={slotRef} className="filter-bar-slot" />
    </Group>
  );
}
