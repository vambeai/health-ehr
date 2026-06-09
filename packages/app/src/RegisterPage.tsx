// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Anchor, Button, Divider, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import { Document, Logo, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { isRegisterEnabled } from './config';
import { firebaseGoogleSignIn, firebaseRegisterWithEmailPassword } from './firebase';

export function RegisterPage(): JSX.Element | null {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [clinicName, setClinicName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  if (!isRegisterEnabled()) {
    return (
      <Document width={450}>
        <Alert icon={<IconAlertCircle size={16} />} title="New clinics disabled" color="red">
          New clinic registration is disabled on this server.
        </Alert>
      </Document>
    );
  }

  if (medplum.getProfile()) {
    return (
      <Document width={450}>
        <Alert icon={<IconAlertCircle size={16} />} title="You already have access" color="yellow">
          You are already signed in with an existing role. New clinics for existing members are created by an
          administrator, not through this page. <Anchor href="/">Go back home</Anchor>
        </Alert>
      </Document>
    );
  }

  async function register(getToken: () => Promise<string>): Promise<void> {
    setError(undefined);
    if (clinicName.trim().length < 4) {
      setError('Clinic name must be at least 4 characters');
      return;
    }
    setLoading(true);
    try {
      const firebaseIdToken = await getToken();
      const { codeChallenge, codeChallengeMethod } = await medplum.startPkce();

      // If this account already has a role, registration is not the right path
      let hasAccess = false;
      try {
        await medplum.post('auth/firebase', { firebaseIdToken, codeChallenge, codeChallengeMethod });
        hasAccess = true;
      } catch (err) {
        if (!normalizeErrorString(err).includes('User not found')) {
          throw err;
        }
      }
      if (hasAccess) {
        setError('This account already has access. Please sign in instead.');
        return;
      }

      const loginResponse = (await medplum.post('auth/firebase', {
        firebaseIdToken,
        createUser: true,
        projectId: 'new',
        codeChallenge,
        codeChallengeMethod,
      })) as { login: string };

      const projectResponse = (await medplum.post('auth/newproject', {
        login: loginResponse.login,
        projectName: clinicName.trim(),
      })) as { code: string };

      await medplum.processCode(projectResponse.code);
      // Use window.location.href to force a reload
      // Otherwise we get caught in a React render loop
      window.location.href = '/';
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
          Register a new clinic
        </Title>
        <Text size="sm" ta="center" c="dimmed">
          Create your Vambe account and your clinic. You will be the clinic administrator.
        </Text>
        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            {error}
          </Alert>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            register(() => firebaseRegisterWithEmailPassword(name.trim(), email, password)).catch(console.error);
          }}
        >
          <Stack>
            <TextInput
              name="clinicName"
              label="Clinic name"
              required
              autoFocus
              value={clinicName}
              onChange={(e) => setClinicName(e.currentTarget.value)}
            />
            <TextInput
              name="name"
              label="Your name"
              required
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <TextInput
              name="email"
              type="email"
              label="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <PasswordInput
              name="password"
              label="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            <Button type="submit" loading={loading}>
              Create clinic
            </Button>
            <Divider label="or" labelPosition="center" />
            <Button
              variant="default"
              loading={loading}
              onClick={() => register(firebaseGoogleSignIn).catch(console.error)}
            >
              Continue with Google
            </Button>
            <Text size="sm" ta="center">
              Already have an account?{' '}
              <Anchor component="button" type="button" onClick={() => navigate('/signin')?.catch(console.error)}>
                Sign in
              </Anchor>
            </Text>
          </Stack>
        </form>
      </Stack>
    </Document>
  );
}
