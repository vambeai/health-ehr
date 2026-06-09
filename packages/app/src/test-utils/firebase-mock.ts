// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Jest replacement for both "firebase/app" and "firebase/auth"
// (see moduleNameMapper in jest.config.json)

export const mockFirebaseUser = {
  displayName: 'Test User',
  getIdToken: jest.fn(() => Promise.resolve('mock-firebase-id-token')),
};

export const initializeApp = jest.fn(() => ({}));
export const getAuth = jest.fn(() => ({}));
export class GoogleAuthProvider {}
export const signInWithEmailAndPassword = jest.fn(() => Promise.resolve({ user: mockFirebaseUser }));
export const signInWithPopup = jest.fn(() => Promise.resolve({ user: mockFirebaseUser }));
export const createUserWithEmailAndPassword = jest.fn(() => Promise.resolve({ user: mockFirebaseUser }));
export const updateProfile = jest.fn(() => Promise.resolve());
export const sendPasswordResetEmail = jest.fn(() => Promise.resolve());
