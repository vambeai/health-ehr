// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import { getUserByEmail } from '../oauth/utils';

jest.mock('jose', () => {
  const original = jest.requireActual('jose');
  return {
    ...original,
    jwtVerify: jest.fn((credential: string) => {
      if (credential === 'invalid') {
        throw new Error('Verification failed');
      }
      return {
        // By convention for tests, the credential is a JSON-encoded payload
        // Obviously in the real world the credential would be a Firebase ID token JWT
        payload: JSON.parse(credential),
      };
    }),
  };
});

const app = express();

describe('Firebase Auth', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    config.firebaseProjectId = 'vambe-auth';
    await initApp(app, config);
  });

  beforeEach(() => {
    getConfig().registerEnabled = undefined;
    getConfig().firebaseProjectId = 'vambe-auth';
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Not configured', async () => {
    getConfig().firebaseProjectId = undefined;
    const res = await request(app)
      .post('/auth/firebase')
      .type('json')
      .send({ firebaseIdToken: createIdToken('admin@example.com') });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Firebase authentication is not configured');
  });

  test('Missing firebaseIdToken', async () => {
    const res = await request(app).post('/auth/firebase').type('json').send({ firebaseIdToken: '' });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Missing firebaseIdToken');
  });

  test('Verification failed', async () => {
    const res = await request(app).post('/auth/firebase').type('json').send({ firebaseIdToken: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Verification failed');
  });

  test('Token without email', async () => {
    const res = await request(app)
      .post('/auth/firebase')
      .type('json')
      .send({ firebaseIdToken: JSON.stringify({ user_id: randomUUID() }) });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Firebase token does not include an email address');
  });

  test('Success for existing user', async () => {
    const res = await request(app)
      .post('/auth/firebase')
      .type('json')
      .send({ firebaseIdToken: createIdToken('admin@example.com') });
    expect(res.status).toBe(200);
    expect(res.body.code).toBeDefined();
  });

  test('Do not create user', async () => {
    const email = 'new-firebase-' + randomUUID() + '@example.com';
    const res = await request(app)
      .post('/auth/firebase')
      .type('json')
      .send({ firebaseIdToken: createIdToken(email) });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('User not found');
    expect(await getUserByEmail(email, undefined)).toBeUndefined();
  });

  test('Create user when createUser is set', async () => {
    const email = 'new-firebase-' + randomUUID() + '@example.com';
    const res = await request(app)
      .post('/auth/firebase')
      .type('json')
      .send({ firebaseIdToken: createIdToken(email, 'Firebase Test'), createUser: true });
    expect(res.status).toBe(200);
    expect(res.body.login).toBeDefined();
    const user = await getUserByEmail(email, undefined);
    expect(user).toBeDefined();
    expect(user?.firstName).toBe('Firebase');
    expect(user?.lastName).toBe('Test');
  });

  test('Register new clinic (new project flow)', async () => {
    const email = 'new-clinic-admin-' + randomUUID() + '@example.com';
    const res = await request(app)
      .post('/auth/firebase')
      .type('json')
      .send({ firebaseIdToken: createIdToken(email, 'Clinic Admin'), createUser: true, projectId: 'new' });
    expect(res.status).toBe(200);
    expect(res.body.login).toBeDefined();
    expect(res.body.code).toBeUndefined();

    const res2 = await request(app)
      .post('/auth/newproject')
      .type('json')
      .send({ login: res.body.login, projectName: 'Test Clinic ' + randomUUID() });
    expect(res2.status).toBe(200);
    expect(res2.body.code).toBeDefined();
  });

  test('Registration disabled', async () => {
    getConfig().registerEnabled = false;
    const email = 'new-firebase-' + randomUUID() + '@example.com';
    const res = await request(app)
      .post('/auth/firebase')
      .type('json')
      .send({ firebaseIdToken: createIdToken(email), createUser: true });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Registration is disabled');
  });
});

function createIdToken(email: string, name?: string): string {
  return JSON.stringify({
    user_id: randomUUID(),
    email,
    email_verified: true,
    name,
  });
}
