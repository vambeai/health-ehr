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

// logged out
const medplum = new MockClient({ profile: null });

function mockFirebaseLoginClient(responses: unknown[]): MockClient {
  const client = new MockClient({ profile: null });
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

describe('SignInPage', () => {
  function setup(url = '/signin', medplumClient: MedplumClient = medplum): void {
    render(
      <MemoryRouter initialEntries={[url]} initialIndex={0}>
        <MedplumProvider medplum={medplumClient}>
          <AppRoutes />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  beforeAll(() => {
    Object.defineProperty(global, 'TextEncoder', {
      value: TextEncoder,
    });

    Object.defineProperty(global.self, 'crypto', {
      value: crypto.webcrypto,
    });
  });

  function expectSigninPageRendered(): void {
    expect(screen.getByText('Sign in to Medplum')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  }

  test('Renders', async () => {
    setup();

    expectSigninPageRendered();
  });

  test('Success with email and password', async () => {
    const client = mockFirebaseLoginClient([{ login: '123', code: 'test-code' }]);
    setup('/signin', client);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'admin@example.com' } });
      fireEvent.change(screen.getByLabelText('Password *'), { target: { value: 'password' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    });

    await waitFor(() => expect(client.processCode).toHaveBeenCalledWith('test-code'));
    expect(client.post).toHaveBeenCalledWith(
      'auth/firebase',
      expect.objectContaining({ firebaseIdToken: 'mock-firebase-id-token' })
    );
  });

  test('Success with Google', async () => {
    const client = mockFirebaseLoginClient([{ login: '123', code: 'test-code' }]);
    setup('/signin', client);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    });

    await waitFor(() => expect(client.processCode).toHaveBeenCalledWith('test-code'));
  });

  test('Multiple memberships', async () => {
    const client = mockFirebaseLoginClient([
      {
        login: '123',
        memberships: [
          { id: 'm1', profile: { display: 'Dr. Alice Smith' } },
          { id: 'm2', profile: { display: 'Dr. Bob Jones' } },
        ],
      },
      { login: '123', code: 'test-code' },
    ]);
    setup('/signin', client);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'admin@example.com' } });
      fireEvent.change(screen.getByLabelText('Password *'), { target: { value: 'password' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    });

    const choice = await screen.findByRole('button', { name: 'Dr. Bob Jones' });
    await act(async () => {
      fireEvent.click(choice);
    });

    await waitFor(() => expect(client.processCode).toHaveBeenCalledWith('test-code'));
    expect(client.post).toHaveBeenCalledWith('auth/profile', { login: '123', profile: 'm2' });
  });

  test('Sign in error shown', async () => {
    const client = mockFirebaseLoginClient([new Error('User not found')]);
    setup('/signin', client);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'nobody@example.com' } });
      fireEvent.change(screen.getByLabelText('Password *'), { target: { value: 'password' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    });

    expect(await screen.findByText('User not found')).toBeInTheDocument();
  });

  test('Forgot password', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByText('Forgot password'));
    });

    expect(await screen.findByRole('button', { name: 'Send reset email' })).toBeInTheDocument();
  });

  test('Register enabled', async () => {
    getConfig().registerEnabled = true;
    setup();

    await act(async () => {
      fireEvent.click(screen.getByText('Register'));
    });

    expect(await screen.findByText('Register a new clinic')).toBeInTheDocument();
  });

  test('Register disabled', async () => {
    getConfig().registerEnabled = false;
    setup();

    expectSigninPageRendered();
    expect(screen.queryByText('Register')).not.toBeInTheDocument();
  });

  test('New project redirects to register', async () => {
    getConfig().registerEnabled = true;
    setup('/signin?project=new');

    expect(await screen.findByText('Register a new clinic')).toBeInTheDocument();
  });

  test('Does NOT automatically redirect to next if logged in and next NOT present', async () => {
    setup('/signin', new MockClient({ profile: DrAliceSmith }));

    expectSigninPageRendered();
  });

  test('Automatically redirects to next if logged in and next present', async () => {
    setup('/signin?next=/batch', new MockClient({ profile: DrAliceSmith }));

    expect(await screen.findByText('Batch Create')).toBeInTheDocument();
  });

  test('Automatically redirects to homepage if logged with bad next', async () => {
    setup('/signin?next=https%3A%2F%2Fevil.com', new MockClient({ profile: DrAliceSmith }));

    // should redirect to the homepage
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });
});
