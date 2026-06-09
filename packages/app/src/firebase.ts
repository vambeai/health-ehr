// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { FirebaseApp } from 'firebase/app';
import { initializeApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { getConfig } from './config';

let firebaseAuth: Auth | undefined;

export function isFirebaseEnabled(): boolean {
  return !!getConfig().firebaseApiKey;
}

function getFirebaseAuth(): Auth {
  if (!firebaseAuth) {
    const config = getConfig();
    const app: FirebaseApp = initializeApp({
      apiKey: config.firebaseApiKey,
      authDomain: config.firebaseAuthDomain,
      projectId: config.firebaseProjectId,
      appId: config.firebaseAppId,
    });
    firebaseAuth = getAuth(app);
  }
  return firebaseAuth;
}

export async function firebaseEmailPasswordSignIn(email: string, password: string): Promise<string> {
  const result = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  return result.user.getIdToken();
}

export async function firebaseGoogleSignIn(): Promise<string> {
  const result = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
  return result.user.getIdToken();
}

/**
 * Creates a Firebase account (or signs in if the email is already registered)
 * and returns a fresh ID token that includes the display name claim.
 */
export async function firebaseRegisterWithEmailPassword(name: string, email: string, password: string): Promise<string> {
  const auth = getFirebaseAuth();
  let credential;
  try {
    credential = await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    if ((err as { code?: string })?.code === 'auth/email-already-in-use') {
      credential = await signInWithEmailAndPassword(auth, email, password);
    } else {
      throw err;
    }
  }
  if (name && !credential.user.displayName) {
    await updateProfile(credential.user, { displayName: name });
  }
  // Force refresh so the token carries the updated name claim
  return credential.user.getIdToken(true);
}

export async function firebaseSendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(getFirebaseAuth(), email);
}
