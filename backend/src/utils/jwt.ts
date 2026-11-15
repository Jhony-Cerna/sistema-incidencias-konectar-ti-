import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export type RoleCode = 'ADMIN' | 'TECNICO' | 'COLABORADOR';

export interface JwtUserPayload {
  userId: number;
  email: string;
  role: RoleCode;
  employeeCode: string;
}

export function signAccessToken(payload: JwtUserPayload): string {
  const options: SignOptions = {
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyAccessToken(token: string): JwtUserPayload {
  return jwt.verify(token, env.jwtSecret) as JwtUserPayload;
}
