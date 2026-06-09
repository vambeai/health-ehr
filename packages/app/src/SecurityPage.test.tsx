// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from './AppRoutes';
import { act, fireEvent, render, screen } from './test-utils/render';

const medplum = new MockClient();

async function setup(): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/security']} initialIndex={0}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <AppRoutes />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('SecurityPage', () => {
  test('Renders', async () => {
    await setup();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });

  test('Password section removed (auth is managed by Firebase)', async () => {
    await setup();
    expect(screen.queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument();
    expect(screen.queryByText('Multi Factor Auth')).not.toBeInTheDocument();
  });

  test('Revoke session', async () => {
    await setup();

    const revokeLinks = screen.getAllByText('Revoke');
    expect(revokeLinks).toHaveLength(2);

    await act(async () => {
      fireEvent.click(revokeLinks[1]);
    });

    expect(await screen.findByText('Login revoked')).toBeInTheDocument();
  });
});
