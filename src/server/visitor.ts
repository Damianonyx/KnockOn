/**
 * Who is asking, without accounts.
 *
 * Each browser gets a random private ID in an HttpOnly cookie (scripts cannot
 * read it). Projects are stored with a hash of that ID, so a visitor only ever
 * sees and edits their own projects, and a database leak does not reveal the
 * IDs. The network address is also hashed, only for rate limits.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { NextResponse } from 'next/server';
import { handle } from './http';

export const OWNER_COOKIE = 'ko_owner';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;
const TWO_YEARS = 60 * 60 * 24 * 730;

export interface Visitor {
  /** sha256 of the private browser ID: the project owner. */
  ownerHash: string;
  /** sha256 of the network address, for rate limits only. */
  ipHash: string;
  /** Set when this request created the ID, so the response must store it. */
  newToken?: string;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function readCookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function visitorFrom(request: Request): Visitor {
  let token = readCookie(request.headers.get('cookie'), OWNER_COOKIE);
  let newToken: string | undefined;
  if (!token || !TOKEN_PATTERN.test(token)) {
    token = randomBytes(32).toString('base64url');
    newToken = token;
  }
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown';
  return { ownerHash: sha256(`owner:${token}`), ipHash: sha256(`ip:${ip}`), newToken };
}

/** Run a route handler for this visitor, storing a new private ID in the response when one was created. */
export async function withVisitor(request: Request, work: (visitor: Visitor) => Promise<NextResponse>): Promise<NextResponse> {
  const visitor = visitorFrom(request);
  const response = await handle(() => work(visitor));
  if (visitor.newToken) {
    response.cookies.set(OWNER_COOKIE, visitor.newToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: TWO_YEARS,
    });
  }
  return response;
}
