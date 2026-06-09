// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Anchor, Button, Stack, Text, TextInput, Title } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import { Document, Logo } from '@medplum/react';
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { firebaseSendPasswordReset } from './firebase';

export function ResetPasswordPage(): JSX.Element {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function sendReset(): Promise<void> {
    setError(undefined);
    setLoading(true);
    try {
      await firebaseSendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Document width={450}>
      <Stack>
        <Logo size={32} />
        <Title order={3} ta="center">
          Reset password
        </Title>
        {sent ? (
          <Alert icon={<IconCircleCheck size={16} />} color="green">
            If an account exists for {email}, a password reset email has been sent. Check your inbox.
          </Alert>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendReset().catch(console.error);
            }}
          >
            <Stack>
              {error && (
                <Alert icon={<IconAlertCircle size={16} />} color="red">
                  {error}
                </Alert>
              )}
              <TextInput
                name="email"
                type="email"
                label="Email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
              />
              <Button type="submit" loading={loading}>
                Send reset email
              </Button>
            </Stack>
          </form>
        )}
        <Text size="sm" ta="center">
          <Anchor component="button" type="button" onClick={() => navigate('/signin')?.catch(console.error)}>
            Back to sign in
          </Anchor>
        </Text>
      </Stack>
    </Document>
  );
}
