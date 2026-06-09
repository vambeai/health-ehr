// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, isString, isUUID, OAuthSigningAlgorithm } from '@medplum/core';
import type { ResourceType, User } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import type { JWTPayload, JWTVerifyOptions } from 'jose';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../config/loader';
import { sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo } from '../fhir/repo';
import { getUserByEmail, tryLogin } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { getProjectIdByClientId, sendLoginResult } from './utils';

/*
 * Sign in with Firebase Authentication.
 * The client signs in with the Firebase client SDK and posts the resulting
 * ID token to /auth/firebase, which exchanges it for a Medplum login.
 * Verification follows the third-party JWT library guidance:
 * https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 */

/**
 * Firebase JSON Web Key Set.
 * Public certs used to verify Firebase ID tokens (issued by securetoken.google.com).
 */
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

/**
 * The decoded payload of a Firebase ID token.
 */
export interface FirebaseTokenClaims extends JWTPayload {
  /** The Firebase user ID (same as `sub`). */
  readonly user_id: string;
  readonly email?: string;
  readonly email_verified?: boolean;
  readonly name?: string;
  readonly picture?: string;
}

export const firebaseValidator = makeValidationMiddleware([
  body('firebaseIdToken').notEmpty().withMessage('Missing firebaseIdToken'),
]);

/**
 * Firebase authentication request handler.
 * This handles POST requests to /auth/firebase.
 * @param req - The request.
 * @param res - The response.
 */
export async function firebaseHandler(req: Request, res: Response): Promise<void> {
  const firebaseProjectId = getConfig().firebaseProjectId;
  if (!firebaseProjectId) {
    sendOutcome(res, badRequest('Firebase authentication is not configured'));
    return;
  }

  // Resource type can optionally be specified.
  // If specified, only memberships of that type will be returned.
  // If not specified, all memberships will be considered.
  const resourceType = req.body.resourceType as ResourceType | undefined;

  let projectId = validateProjectId(req.body.projectId);
  const clientId = req.body.clientId;
  projectId = await getProjectIdByClientId(clientId, projectId);

  const verifyOptions: JWTVerifyOptions = {
    issuer: `https://securetoken.google.com/${firebaseProjectId}`,
    algorithms: [OAuthSigningAlgorithm.RS256],
    audience: firebaseProjectId,
  };

  let result;
  try {
    result = await jwtVerify(req.body.firebaseIdToken as string, JWKS, verifyOptions);
  } catch (err) {
    sendOutcome(res, badRequest((err as Error).message));
    return;
  }

  const claims = result.payload as FirebaseTokenClaims;
  if (!claims.email) {
    sendOutcome(res, badRequest('Firebase token does not include an email address'));
    return;
  }

  const existingUser = await getUserByEmail(claims.email, projectId);
  if (!existingUser) {
    if (!req.body.createUser) {
      sendOutcome(res, badRequest('User not found'));
      return;
    }
    if (getConfig().registerEnabled === false && (!projectId || projectId === 'new')) {
      // Explicitly check for "false" because the config value may be undefined
      sendOutcome(res, badRequest('Registration is disabled'));
      return;
    }
    const nameParts = (claims.name ?? claims.email).trim().split(/\s+/);
    const systemRepo = getGlobalSystemRepo();
    await systemRepo.createResource<User>({
      resourceType: 'User',
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(' ') || nameParts[0],
      email: claims.email,
      project: projectId && projectId !== 'new' ? { reference: 'Project/' + projectId } : undefined,
    });
  }

  const login = await tryLogin({
    authMethod: 'external',
    email: claims.email,
    projectId,
    clientId,
    resourceType,
    scope: req.body.scope ?? 'openid offline_access',
    nonce: req.body.nonce || randomUUID(),
    launchId: req.body.launch,
    codeChallenge: req.body.codeChallenge,
    codeChallengeMethod: req.body.codeChallengeMethod,
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
    allowNoMembership: req.body.createUser || projectId === 'new',
    pictureUrl: claims.picture,
  });
  await sendLoginResult(res, login);
}

function validateProjectId(inputProjectId: unknown): string | undefined {
  return isString(inputProjectId) && (isUUID(inputProjectId) || inputProjectId === 'new') ? inputProjectId : undefined;
}
