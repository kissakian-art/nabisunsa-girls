import {
  PLATFORM_AUDIENCE,
  PORTAL_AUDIENCE,
  decodeToken,
  encodeToken,
} from '../session-token';

const SECRET = 'a'.repeat(64);
const future = () => Math.floor(Date.now() / 1000) + 3600;

describe('a session token', () => {
  it('survives a round trip', () => {
    const payload = { userId: 7, schoolId: 3, expiresAt: future() };
    const token = encodeToken(SECRET, PORTAL_AUDIENCE, payload);
    expect(decodeToken(SECRET, PORTAL_AUDIENCE, token)).toEqual(payload);
  });

  it('is refused once it has expired', () => {
    const token = encodeToken(SECRET, PORTAL_AUDIENCE, {
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    });
    expect(decodeToken(SECRET, PORTAL_AUDIENCE, token)).toBeNull();
  });

  it('is refused under a different secret', () => {
    const token = encodeToken(SECRET, PORTAL_AUDIENCE, { expiresAt: future() });
    expect(decodeToken('b'.repeat(64), PORTAL_AUDIENCE, token)).toBeNull();
  });

  it('is refused when the payload is edited', () => {
    const token = encodeToken(SECRET, PORTAL_AUDIENCE, {
      schoolId: 1,
      expiresAt: future(),
    });
    // What an attacker would actually try: keep the signature, swap the body
    // for one naming a different school.
    const forged = Buffer.from(JSON.stringify({ schoolId: 2, expiresAt: future() })).toString(
      'base64url',
    );
    expect(decodeToken(SECRET, PORTAL_AUDIENCE, `${forged}.${token.split('.')[1]}`)).toBeNull();
  });

  it('is refused when it is not a token at all', () => {
    for (const rubbish of ['', 'x', 'x.y', '.', 'a.b.c', 'null.null']) {
      expect(decodeToken(SECRET, PORTAL_AUDIENCE, rubbish)).toBeNull();
    }
    expect(decodeToken(SECRET, PORTAL_AUDIENCE, undefined)).toBeNull();
  });

  it('is refused when it carries no expiry', () => {
    // Without this a payload that simply omitted expiresAt would never expire.
    const body = Buffer.from(JSON.stringify({ userId: 1 })).toString('base64url');
    const token = encodeToken(SECRET, PORTAL_AUDIENCE, { expiresAt: future() });
    expect(decodeToken(SECRET, PORTAL_AUDIENCE, `${body}.${token.split('.')[1]}`)).toBeNull();
  });
});

describe('the boundary between a school session and a platform one', () => {
  // This is the property the whole split rests on. A school administrator
  // holds a validly signed token; nothing about it may work at /platform,
  // which can suspend every school on the platform.
  it('does not let a school session be used as a platform session', () => {
    const schoolToken = encodeToken(SECRET, PORTAL_AUDIENCE, {
      userId: 1,
      schoolId: 1,
      role: 'school_admin',
      expiresAt: future(),
    });
    expect(decodeToken(SECRET, PLATFORM_AUDIENCE, schoolToken)).toBeNull();
  });

  it('does not let a platform session be used as a school session', () => {
    const platformToken = encodeToken(SECRET, PLATFORM_AUDIENCE, {
      platformUserId: 1,
      expiresAt: future(),
    });
    expect(decodeToken(SECRET, PORTAL_AUDIENCE, platformToken)).toBeNull();
  });

  it('separates them even when the payloads are byte-identical', () => {
    // The payload cannot be what distinguishes them: an attacker chooses it.
    // Only the audience mixed into the signature can.
    const payload = { userId: 1, expiresAt: future() };
    const asSchool = encodeToken(SECRET, PORTAL_AUDIENCE, payload);
    const asPlatform = encodeToken(SECRET, PLATFORM_AUDIENCE, payload);

    expect(asSchool.split('.')[0]).toBe(asPlatform.split('.')[0]);
    expect(asSchool.split('.')[1]).not.toBe(asPlatform.split('.')[1]);
  });

  it('uses audiences that are actually different', () => {
    expect(PORTAL_AUDIENCE).not.toBe(PLATFORM_AUDIENCE);
  });
});
