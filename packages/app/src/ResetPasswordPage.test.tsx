// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { MemoryRouter } from 'react-router';
import { ResetPasswordPage } from './ResetPasswordPage';
import { act, fireEvent, render, screen } from './test-utils/render';

const medplum = new MockClient();

function setup(): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <ResetPasswordPage />
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('ResetPasswordPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Renders', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Send reset email' })).toBeInTheDocument();
  });

  test('Submit success', async () => {
    setup();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'admin@example.com' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send reset email' }));
    });

    expect(sendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), 'admin@example.com');
    expect(await screen.findByText('password reset email has been sent', { exact: false })).toBeInTheDocument();
  });

  test('Submit error', async () => {
    (sendPasswordResetEmail as jest.Mock).mockRejectedValueOnce(new Error('auth/invalid-email'));
    setup();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'unknown@example.com' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send reset email' }));
    });

    expect(await screen.findByText('auth/invalid-email')).toBeInTheDocument();
  });
});
