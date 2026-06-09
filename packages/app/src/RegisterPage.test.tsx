// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import crypto from 'crypto';
import { MemoryRouter } from 'react-router';
import { TextEncoder } from 'util';
import { AppRoutes } from './AppRoutes';
import { getConfig } from './config';
import { act, fireEvent, render, screen, waitFor } from './test-utils/render';

async function setup(medplum: MedplumClient): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/register']} initialIndex={0}>
        <MedplumProvider medplum={medplum}>
          <AppRoutes />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

function mockRegisterClient(responses: unknown[]): MockClient {
  const client = new MockClient();
  client.getProfile = jest.fn(() => undefined) as never;
  client.startPkce = jest.fn(() =>
    Promise.resolve({ codeChallengeMethod: 'S256' as const, codeChallenge: 'xyz' })
  ) as never;
  const post = jest.fn();
  for (const response of responses) {
    if (response instanceof Error) {
      post.mockRejectedValueOnce(response);
    } else {
      post.mockResolvedValueOnce(response);
    }
  }
  client.post = post as never;
  client.processCode = jest.fn(() => Promise.resolve(DrAliceSmith)) as never;
  return client;
}

async function fillForm(): Promise<void> {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Clinic name *'), { target: { value: 'Test Clinic' } });
    fireEvent.change(screen.getByLabelText('Your name *'), { target: { value: 'George Washington' } });
    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'george@example.com' } });
    fireEvent.change(screen.getByLabelText('Password *'), { target: { value: 'password' } });
  });
}

describe('RegisterPage', () => {
  beforeAll(() => {
    Object.defineProperty(global, 'TextEncoder', {
      value: TextEncoder,
    });

    Object.defineProperty(global, 'crypto', {
      value: crypto.webcrypto,
    });
  });

  beforeEach(() => {
    getConfig().registerEnabled = true;
  });

  test('Renders', async () => {
    const medplum = new MockClient();
    medplum.getProfile = jest.fn(() => undefined) as never;
    await setup(medplum);
    expect(screen.getByRole('button', { name: 'Create clinic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  test('Blocked if already signed in with a role', async () => {
    const medplum = new MockClient();
    await setup(medplum);
    expect(screen.getByText('You already have access')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create clinic' })).not.toBeInTheDocument();
  });

  test('Register disabled', async () => {
    getConfig().registerEnabled = false;

    const medplum = new MockClient();
    medplum.getProfile = jest.fn(() => undefined) as never;
    await setup(medplum);

    expect(screen.getByText('New clinic registration is disabled on this server.')).toBeInTheDocument();
  });

  test('Clinic name too short', async () => {
    const medplum = mockRegisterClient([]);
    await setup(medplum);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Clinic name *'), { target: { value: 'abc' } });
      fireEvent.change(screen.getByLabelText('Your name *'), { target: { value: 'George Washington' } });
      fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'george@example.com' } });
      fireEvent.change(screen.getByLabelText('Password *'), { target: { value: 'password' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create clinic' }));
    });

    expect(await screen.findByText('Clinic name must be at least 4 characters')).toBeInTheDocument();
    expect(medplum.post).not.toHaveBeenCalled();
  });

  test('Submit success', async () => {
    const medplum = mockRegisterClient([
      new Error('User not found'), // guard: no existing access
      { login: 'login-1' }, // auth/firebase with createUser + new project
      { login: 'login-1', code: 'code-1' }, // auth/newproject
    ]);
    await setup(medplum);
    await fillForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create clinic' }));
    });

    await waitFor(() => expect(medplum.processCode).toHaveBeenCalledWith('code-1'));
    expect(medplum.post).toHaveBeenCalledWith(
      'auth/firebase',
      expect.objectContaining({ createUser: true, projectId: 'new' })
    );
    expect(medplum.post).toHaveBeenCalledWith('auth/newproject', {
      login: 'login-1',
      projectName: 'Test Clinic',
    });
  });

  test('Blocked if the account already has access', async () => {
    const medplum = mockRegisterClient([{ login: 'login-1', code: 'code-1' }]);
    await setup(medplum);
    await fillForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create clinic' }));
    });

    expect(await screen.findByText('This account already has access. Please sign in instead.')).toBeInTheDocument();
    expect(medplum.processCode).not.toHaveBeenCalled();
  });
});
