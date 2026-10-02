import {
  ActionIcon,
  Button,
  Card,
  Group,
  Slider,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconFolder,
  IconFolderMinus,
  IconFolderPlus,
  IconHome,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';

import { type LatLng } from '@shared/events';

import { HiddenView } from './HiddenView';
import { HomeMap } from './RouteMap';

interface SettingsViewProps {
  folders: string[];
  busy: boolean;
  onAddFolder: () => void;
  onRescan: () => void;
  onRemoveFolder: (folder: string) => void;
  home: LatLng | null;
  suggestedHome: LatLng | null;
  onHomeChange: (home: LatLng | null) => void;
  gapHours: number;
  onGapHoursChange: (hours: number) => void;
  tripKm: number;
  onTripKmChange: (km: number) => void;
  mapAvailable: boolean;
  hiddenCount: number;
  onRestored: () => void;
}

export function SettingsView({
  hiddenCount,
  onRestored,
  folders,
  busy,
  onAddFolder,
  onRescan,
  onRemoveFolder,
  home,
  suggestedHome,
  onHomeChange,
  gapHours,
  onGapHoursChange,
  tripKm,
  onTripKmChange,
  mapAvailable,
}: SettingsViewProps) {
  return (
    <Stack p="lg" maw={760}>
      <Card withBorder radius="md" padding="lg" id="settings-home">
        <Title order={4} mb="xs">
          Trips and events
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Photos are grouped into events by time. Events more than {tripKm} km from home
          are shown as trips. Home is stored only in your encrypted library.
        </Text>
        <Group gap="xs" mb="sm">
          <IconHome size={16} />
          <Text size="sm" ff="monospace" style={{ flex: 1 }}>
            {home ? `${home.lat.toFixed(4)}, ${home.lng.toFixed(4)}` : 'Home not set'}
          </Text>
          <Button
            size="xs"
            variant="light"
            disabled={!suggestedHome}
            onClick={() => suggestedHome && onHomeChange(suggestedHome)}
          >
            Use most common location
          </Button>
          {home && (
            <Tooltip label="Clear home">
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Clear home"
                onClick={() => onHomeChange(null)}
              >
                <IconX size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
        {mapAvailable && (
          <>
            <Text size="xs" c="dimmed" mb={4}>
              Or click the map to set home.
            </Text>
            <HomeMap home={home} onPick={onHomeChange} />
          </>
        )}
        <Text size="sm" mt="md">
          New event after a gap of {gapHours} hours
        </Text>
        <Slider
          mt={4}
          min={2}
          max={24}
          step={1}
          value={gapHours}
          onChange={onGapHoursChange}
          marks={[
            { value: 2, label: '2h' },
            { value: 8, label: '8h' },
            { value: 24, label: '24h' },
          ]}
          mb="md"
        />
        <Text size="sm" mt="lg" c={home ? undefined : 'dimmed'}>
          Trip when more than {tripKm} km from home
          {!home && ' (set home first)'}
        </Text>
        <Slider
          mt={4}
          min={0}
          max={100}
          step={5}
          value={tripKm}
          onChange={onTripKmChange}
          disabled={!home}
          label={(value) => `${value} km`}
          marks={[
            { value: 0, label: '0' },
            { value: 50, label: '50 km' },
            { value: 100, label: '100 km' },
          ]}
          mb="md"
        />
      </Card>
      <Card withBorder radius="md" padding="lg">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Folders</Title>
          <Group gap="xs">
            <Button
              variant="default"
              size="xs"
              leftSection={<IconRefresh size={14} />}
              disabled={busy || folders.length === 0}
              onClick={onRescan}
            >
              Rescan
            </Button>
            <Button
              size="xs"
              leftSection={<IconFolderPlus size={14} />}
              loading={busy}
              onClick={onAddFolder}
            >
              Add folder
            </Button>
          </Group>
        </Group>
        {folders.length === 0 ? (
          <Text c="dimmed">No folders imported yet.</Text>
        ) : (
          <Stack gap="xs">
            {folders.map((folder) => (
              <Group key={folder} gap="xs" wrap="nowrap">
                <IconFolder size={16} />
                <Text
                  size="sm"
                  ff="monospace"
                  style={{ flex: 1, wordBreak: 'break-all' }}
                >
                  {folder}
                </Text>
                <Tooltip label="Stop tracking (photos stay in the library; files are untouched)">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    disabled={busy}
                    aria-label="Stop tracking folder"
                    onClick={() => onRemoveFolder(folder)}
                  >
                    <IconFolderMinus size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            ))}
          </Stack>
        )}
      </Card>
      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="sm">
          Privacy
        </Title>
        <Text size="sm" c="dimmed">
          The map loads street tiles from OpenStreetMap, which can see the map area you
          view and your IP address. Your photos and their details never leave this
          computer.
        </Text>
      </Card>
      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="xs">
          Hidden photos{hiddenCount > 0 && ` (${hiddenCount})`}
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Hidden photos don't appear in Timeline, Trips or Map. Viewing the list requires
          your password. Restore brings them back; the original files are never touched.
        </Text>
        <HiddenView count={hiddenCount} onRestored={onRestored} />
      </Card>
    </Stack>
  );
}
