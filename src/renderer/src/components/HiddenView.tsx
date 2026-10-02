import { Button, Group, Table, Text } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState } from 'react';

import type { PhotoDto } from '@shared/api';
import { fileNameOf } from '@shared/paths';

import { errorMessage } from '../error-message';
import { PasswordDialog } from './PasswordDialog';

interface HiddenViewProps {
  count: number;
  onRestored: () => void;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Hidden photos as a text-only list (no thumbnails), shown only after the password. */
export function HiddenView({ count, onRestored }: HiddenViewProps) {
  const [photos, setPhotos] = useState<PhotoDto[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const show = async () => {
    setError(null);
    if (await window.api.hideAuthorized().catch(() => false)) {
      try {
        setPhotos(await window.api.listHidden(null));
        return;
      } catch {
        // Grace period ran out; ask for the password.
      }
    }
    setAsking(true);
  };

  const restore = async (id: number) => {
    try {
      await window.api.restorePhoto(id);
      setPhotos((current) => current?.filter((p) => p.id !== id) ?? null);
      onRestored();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      {photos === null ? (
        <Button
          variant="light"
          size="xs"
          leftSection={<IconEye size={14} />}
          disabled={count === 0}
          onClick={show}
        >
          {count === 0 ? 'No hidden photos' : `Show hidden photos (${count})`}
        </Button>
      ) : photos.length === 0 ? (
        <Text c="dimmed" size="sm">
          No hidden photos.
        </Text>
      ) : (
        <>
          <Group justify="flex-end" mb="xs">
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<IconEyeOff size={12} />}
              onClick={() => setPhotos(null)}
            >
              Close list
            </Button>
          </Group>
          <Table striped highlightOnHover fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>File</Table.Th>
                <Table.Th>Taken</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {photos.map((photo) => (
                <Table.Tr key={photo.id}>
                  <Table.Td title={photo.path} style={{ wordBreak: 'break-all' }}>
                    {fileNameOf(photo.path)}
                    {photo.mediaType === 'video' && ' (video)'}
                  </Table.Td>
                  <Table.Td>
                    {photo.takenAt ? dateFormatter.format(photo.takenAt) : '—'}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Button
                      size="compact-xs"
                      variant="light"
                      onClick={() => restore(photo.id)}
                    >
                      Restore
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
      {error && (
        <Text c="red" size="sm" mt="xs">
          {error}
        </Text>
      )}
      {asking && (
        <PasswordDialog
          title="Show hidden photos"
          description="Enter your password to see the list of hidden photos."
          note="You won't be asked again for the next 10 minutes."
          confirmLabel="Show"
          onCancel={() => setAsking(false)}
          onConfirm={async (password) => {
            setPhotos(await window.api.listHidden(password));
            setAsking(false);
          }}
        />
      )}
    </>
  );
}
