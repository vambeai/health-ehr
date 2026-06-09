// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Anchor, Button, Divider, Group, Stack, TextInput, PasswordInput } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import type { ProjectMembership } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { getConfig } from './config';
import { firebaseEmailPasswordSignIn, firebaseGoogleSignIn } from './firebase';

interface FirebaseLoginResponse {
  readonly login: string;
  readonly code?: string;
  readonly memberships?: ProjectMembership[];
}

export interface FirebaseSignInFormProps {
  readonly projectId?: string;
  readonly onSuccess: () => void;
  readonly onForgotPassword?: () => void;
  readonly onRegister?: () => void;
  readonly children?: ReactNode;
}

export function FirebaseSignInForm(props: FirebaseSignInFormProps): JSX.Element {
  const medplum = useMedplum();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [loginResponse, setLoginResponse] = useState<FirebaseLoginResponse | undefined>(undefined);

  async function exchangeToken(firebaseIdToken: string): Promise<void> {
    const { codeChallenge, codeChallengeMethod } = await medplum.startPkce();
    const response = (await medplum.post('auth/firebase', {
      firebaseIdToken,
      clientId: getConfig().clientId || undefined,
      projectId: props.projectId,
      scope: 'openid offline_access',
      codeChallenge,
      codeChallengeMethod,
    })) as FirebaseLoginResponse;
    await handleLoginResponse(response);
  }

  async function handleLoginResponse(response: FirebaseLoginResponse): Promise<void> {
    if (response.code) {
      await medplum.processCode(response.code);
      props.onSuccess();
      return;
    }
    if (response.memberships) {
      setLoginResponse(response);
      return;
    }
    setError('Unexpected login response');
  }

  async function chooseMembership(membership: ProjectMembership): Promise<void> {
    setError(undefined);
    setLoading(true);
    try {
      const response = (await medplum.post('auth/profile', {
        login: (loginResponse as FirebaseLoginResponse).login,
        profile: membership.id,
      })) as FirebaseLoginResponse;
      await handleLoginResponse(response);
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setLoading(false);
    }
  }

  async function signIn(getToken: () => Promise<string>): Promise<void> {
    setError(undefined);
    setLoading(true);
    try {
      await exchangeToken(await getToken());
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Document width={450}>
      <Stack>
        {props.children}
        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            {error}
          </Alert>
        )}
        {loginResponse?.memberships ? (
          <Stack>
            {loginResponse.memberships.map((membership) => (
              <Button
                key={membership.id}
                variant="default"
                loading={loading}
                onClick={() => chooseMembership(membership).catch(console.error)}
              >
                {membership.profile?.display ?? membership.profile?.reference}
              </Button>
            ))}
          </Stack>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              signIn(() => firebaseEmailPasswordSignIn(email, password)).catch(console.error);
            }}
          >
            <Stack>
              <TextInput
                name="email"
                type="email"
                label="Email"
                required
                autoFocus
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
                Sign in
              </Button>
              <Divider label="or" labelPosition="center" />
              <Button
                variant="default"
                loading={loading}
                onClick={() => signIn(firebaseGoogleSignIn).catch(console.error)}
              >
                Sign in with Google
              </Button>
              {(props.onForgotPassword || props.onRegister) && (
                <Group justify="space-between">
                  {props.onForgotPassword ? (
                    <Anchor component="button" type="button" size="sm" onClick={props.onForgotPassword}>
                      Forgot password
                    </Anchor>
                  ) : (
                    <span />
                  )}
                  {props.onRegister && (
                    <Anchor component="button" type="button" size="sm" onClick={props.onRegister}>
                      Register
                    </Anchor>
                  )}
                </Group>
              )}
            </Stack>
          </form>
        )}
      </Stack>
    </Document>
  );
}
