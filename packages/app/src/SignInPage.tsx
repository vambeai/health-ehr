// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text, Title } from '@mantine/core';
import { getAppName, Logo, useMedplumProfile } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { isRegisterEnabled } from './config';
import { FirebaseSignInForm } from './FirebaseSignInForm';

export function SignInPage(): JSX.Element {
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const navigateToNext = useCallback(() => {
    // only redirect to next if it is a pathname to avoid redirecting
    // to a maliciously crafted URL, e.g. /signin?next=https%3A%2F%2Fevil.com
    const nextUrl = searchParams.get('next');
    navigate(nextUrl?.startsWith('/') ? nextUrl : '/')?.catch(console.error);
  }, [searchParams, navigate]);

  useEffect(() => {
    if (profile && searchParams.has('next')) {
      navigateToNext();
    }
  }, [profile, searchParams, navigateToNext]);

  if (searchParams.get('project') === 'new') {
    // New projects are created through the register flow
    return <Navigate to="/register" replace />;
  }

  return (
    <FirebaseSignInForm
      projectId={searchParams.get('project') || undefined}
      onSuccess={() => navigateToNext()}
      onForgotPassword={() => navigate('/resetpassword')?.catch(console.error)}
      onRegister={isRegisterEnabled() ? () => navigate('/register')?.catch(console.error) : undefined}
    >
      <Logo size={32} />
      <Title order={3} ta="center">
        Sign in to {getAppName()}
      </Title>
      <Text size="sm" ta="center" c="dimmed">
        Use your Vambe account
      </Text>
    </FirebaseSignInForm>
  );
}
