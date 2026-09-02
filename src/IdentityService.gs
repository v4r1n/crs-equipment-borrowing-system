var GOOGLE_IDENTITY_JWKS_URL_ = 'https://www.googleapis.com/oauth2/v3/certs';
var GOOGLE_IDENTITY_JWKS_CACHE_KEY_ = 'google-identity-jwks:v1';
var GOOGLE_IDENTITY_JWKS_CACHE_SECONDS_ = 21600;
var GOOGLE_ID_TOKEN_MAX_LENGTH_ = 8192;
var GOOGLE_ID_TOKEN_CLOCK_SKEW_SECONDS_ = 300;
var SHA256_DIGEST_INFO_PREFIX_ = Object.freeze([
  0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86,
  0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05,
  0x00, 0x04, 0x20
]);

function verifyGoogleIdToken_(idToken) {
  var config = getRuntimeConfig_();
  var clientId = normalizeWhitespace_(config.GOOGLE_OAUTH_CLIENT_ID);
  assertApp_(isGoogleOAuthClientId_(clientId),
    'CONFIG_ERROR', 'กรุณาตั้งค่า GOOGLE_OAUTH_CLIENT_ID ให้ถูกต้องก่อนเปิดใช้งานระบบ', null, false);

  var allowedDomains = Array.isArray(config.ALLOWED_DOMAINS)
    ? config.ALLOWED_DOMAINS.map(normalizeDomain_).filter(Boolean)
    : [];
  assertApp_(allowedDomains.length && allowedDomains.every(isSafeDomainValue_), 'CONFIG_ERROR',
    'กรุณาตั้งค่า ALLOWED_DOMAINS ก่อนเปิดใช้งานระบบ', null, false);

  var token = typeof idToken === 'string' ? idToken.trim() : '';
  assertApp_(token && token.length <= GOOGLE_ID_TOKEN_MAX_LENGTH_, 'UNAUTHENTICATED',
    'กรุณาลงชื่อเข้าใช้ด้วยบัญชี Google ที่ได้รับอนุญาต', null, false);
  var segments = token.split('.');
  assertApp_(segments.length === 3 && segments.every(function (segment) { return Boolean(segment); }),
    'UNAUTHENTICATED', 'ข้อมูลการลงชื่อเข้าใช้ไม่ถูกต้อง กรุณาลงชื่อเข้าใช้อีกครั้ง', null, false);

  var header = decodeGoogleJwtJson_(segments[0]);
  var claims = decodeGoogleJwtJson_(segments[1]);
  assertApp_(header && header.alg === 'RS256' && (!header.typ || header.typ === 'JWT') &&
    typeof header.kid === 'string' &&
    /^[A-Za-z0-9_-]{1,200}$/.test(header.kid), 'UNAUTHENTICATED',
  'ข้อมูลการลงชื่อเข้าใช้ไม่ถูกต้อง กรุณาลงชื่อเข้าใช้อีกครั้ง', null, false);
  var jwk = getGoogleIdentityJwk_(header.kid);
  assertApp_(verifyRs256Signature_(segments[0] + '.' + segments[1], segments[2], jwk),
    'UNAUTHENTICATED', 'ข้อมูลการลงชื่อเข้าใช้ไม่ถูกต้อง กรุณาลงชื่อเข้าใช้อีกครั้ง', null, false);

  validateGoogleIdentityClaims_(claims, clientId);
  var email = normalizeEmail_(claims.email);
  var emailDomain = email.slice(email.lastIndexOf('@') + 1);
  assertApp_(allowedDomains.indexOf(emailDomain) !== -1, 'FORBIDDEN',
    'บัญชีนี้อยู่นอกโดเมนที่องค์กรอนุญาต', null, false);
  assertApp_(isGoogleAuthoritativeEmail_(claims, emailDomain), 'UNAUTHENTICATED',
    'ไม่สามารถยืนยันความเป็นเจ้าของอีเมล Google ของบัญชีนี้ได้', null, false);

  return Object.freeze({
    subject: claims.sub,
    email: email,
    domain: emailDomain,
    expiresAt: claims.exp
  });
}

function isGoogleOAuthClientId_(value) {
  return /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(
    normalizeWhitespace_(value)
  );
}

function validateGoogleIdentityClaims_(claims, clientId) {
  assertApp_(claims && typeof claims === 'object' && !Array.isArray(claims),
    'UNAUTHENTICATED', 'ข้อมูลการลงชื่อเข้าใช้ไม่ถูกต้อง กรุณาลงชื่อเข้าใช้อีกครั้ง', null, false);
  assertApp_(claims.iss === 'accounts.google.com' || claims.iss === 'https://accounts.google.com',
    'UNAUTHENTICATED', 'ข้อมูลการลงชื่อเข้าใช้ไม่ถูกต้อง กรุณาลงชื่อเข้าใช้อีกครั้ง', null, false);

  var audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  assertApp_(audiences.length > 0 && audiences.every(function (audience) {
    return typeof audience === 'string' && audience.length > 0;
  }) && audiences.indexOf(clientId) !== -1, 'UNAUTHENTICATED',
    'ข้อมูลการลงชื่อเข้าใช้ไม่ได้ออกให้ระบบนี้', null, false);
  if (audiences.length > 1) {
    assertApp_(claims.azp === clientId, 'UNAUTHENTICATED',
      'ข้อมูลการลงชื่อเข้าใช้ไม่ได้ออกให้ระบบนี้', null, false);
  }
  if (claims.azp !== undefined && claims.azp !== null && claims.azp !== '') {
    assertApp_(claims.azp === clientId, 'UNAUTHENTICATED',
      'ข้อมูลการลงชื่อเข้าใช้ไม่ได้ออกให้ระบบนี้', null, false);
  }

  var nowSeconds = Math.floor(Date.now() / 1000);
  assertApp_(Number.isInteger(claims.iat) && Number.isInteger(claims.exp), 'UNAUTHENTICATED',
    'ข้อมูลเวลาในหลักฐานการลงชื่อเข้าใช้ไม่ถูกต้อง', null, false);
  assertApp_(claims.iat <= nowSeconds + GOOGLE_ID_TOKEN_CLOCK_SKEW_SECONDS_, 'UNAUTHENTICATED',
    'ข้อมูลเวลาในหลักฐานการลงชื่อเข้าใช้ไม่ถูกต้อง', null, false);
  assertApp_(claims.exp > nowSeconds, 'UNAUTHENTICATED',
    'การลงชื่อเข้าใช้หมดอายุแล้ว กรุณาลงชื่อเข้าใช้อีกครั้ง', null, false);
  assertApp_(claims.exp > claims.iat, 'UNAUTHENTICATED',
    'ข้อมูลเวลาในหลักฐานการลงชื่อเข้าใช้ไม่ถูกต้อง', null, false);
  if (claims.nbf !== undefined && claims.nbf !== null) {
    assertApp_(Number.isInteger(claims.nbf) &&
      claims.nbf <= nowSeconds + GOOGLE_ID_TOKEN_CLOCK_SKEW_SECONDS_, 'UNAUTHENTICATED',
    'ข้อมูลการลงชื่อเข้าใช้ยังไม่สามารถใช้งานได้', null, false);
  }
  assertApp_(typeof claims.sub === 'string' && claims.sub.length > 0 && claims.sub.length <= 255,
    'UNAUTHENTICATED', 'ข้อมูลบัญชี Google ไม่สมบูรณ์', null, false);
  assertApp_(claims.email_verified === true && isSafeEmailValue_(normalizeEmail_(claims.email)),
    'UNAUTHENTICATED', 'Google ยังไม่ได้ยืนยันอีเมลของบัญชีนี้', null, false);
}

function isGoogleAuthoritativeEmail_(claims, emailDomain) {
  if (emailDomain === 'gmail.com') return claims.email_verified === true;
  return claims.email_verified === true && normalizeDomain_(claims.hd) === emailDomain;
}

function getGoogleIdentityJwk_(kid) {
  var cachedKeys = readCachedGoogleIdentityJwks_();
  var cachedMatch = findGoogleIdentityJwk_(cachedKeys, kid);
  if (cachedMatch) return cachedMatch;
  assertApp_(!cachedKeys.length, 'UNAUTHENTICATED',
    'ไม่พบกุญแจที่ใช้ยืนยันข้อมูลการลงชื่อเข้าใช้ กรุณาลงชื่อเข้าใช้อีกครั้ง', null, false);
  var freshKeys = fetchGoogleIdentityJwks_();
  var freshMatch = findGoogleIdentityJwk_(freshKeys, kid);
  assertApp_(freshMatch, 'UNAUTHENTICATED',
    'ไม่พบกุญแจที่ใช้ยืนยันข้อมูลการลงชื่อเข้าใช้ กรุณาลงชื่อเข้าใช้อีกครั้ง', null, false);
  return freshMatch;
}

function readCachedGoogleIdentityJwks_() {
  var cache;
  var serialized;
  try {
    cache = CacheService.getScriptCache();
    serialized = cache.get(GOOGLE_IDENTITY_JWKS_CACHE_KEY_);
  } catch (error) {
    return [];
  }
  if (!serialized) return [];
  try {
    return validateGoogleIdentityJwks_(JSON.parse(serialized));
  } catch (error) {
    try { cache.remove(GOOGLE_IDENTITY_JWKS_CACHE_KEY_); }
    catch (removeError) { /* Cache is best-effort only. */ }
    return [];
  }
}

function fetchGoogleIdentityJwks_() {
  var response;
  try {
    response = UrlFetchApp.fetch(GOOGLE_IDENTITY_JWKS_URL_, {
      method: 'get',
      followRedirects: false,
      muteHttpExceptions: true,
      headers: { Accept: 'application/json' }
    });
  } catch (error) {
    throw new AppError_('AUTH_SERVICE_UNAVAILABLE',
      'ไม่สามารถตรวจสอบการลงชื่อเข้าใช้กับ Google ได้ กรุณาลองใหม่อีกครั้ง', null, true);
  }
  if (!response || response.getResponseCode() !== 200) {
    throw new AppError_('AUTH_SERVICE_UNAVAILABLE',
      'ไม่สามารถตรวจสอบการลงชื่อเข้าใช้กับ Google ได้ กรุณาลองใหม่อีกครั้ง', null, true);
  }
  var keys;
  try {
    keys = validateGoogleIdentityJwks_(JSON.parse(response.getContentText()));
  } catch (error) {
    throw new AppError_('AUTH_SERVICE_UNAVAILABLE',
      'ข้อมูลกุญแจยืนยันตัวตนจาก Google ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง', null, true);
  }
  var cacheSeconds = googleIdentityJwksCacheSeconds_(response);
  if (cacheSeconds > 0) {
    try {
      CacheService.getScriptCache().put(
        GOOGLE_IDENTITY_JWKS_CACHE_KEY_,
        JSON.stringify({ keys: keys }),
        cacheSeconds
      );
    } catch (cacheError) {
      console.warn('Google identity JWKS cache write failed');
    }
  }
  return keys;
}

function validateGoogleIdentityJwks_(document) {
  assertApp_(document && Array.isArray(document.keys) && document.keys.length > 0 &&
    document.keys.length <= 20, 'AUTH_SERVICE_UNAVAILABLE',
  'ข้อมูลกุญแจยืนยันตัวตนจาก Google ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง', null, true);
  var keys = document.keys.filter(function (key) {
    return key && key.kty === 'RSA' && (!key.use || key.use === 'sig') &&
      (!key.alg || key.alg === 'RS256') && typeof key.kid === 'string' &&
      /^[A-Za-z0-9_-]{1,200}$/.test(key.kid) &&
      typeof key.n === 'string' && /^[A-Za-z0-9_-]+$/.test(key.n) &&
      typeof key.e === 'string' && /^[A-Za-z0-9_-]+$/.test(key.e);
  });
  assertApp_(keys.length > 0, 'AUTH_SERVICE_UNAVAILABLE',
    'ข้อมูลกุญแจยืนยันตัวตนจาก Google ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง', null, true);
  return keys;
}

function googleIdentityJwksCacheSeconds_(response) {
  var headers = response && typeof response.getHeaders === 'function'
    ? response.getHeaders()
    : {};
  var cacheControl = '';
  Object.keys(headers || {}).some(function (name) {
    if (String(name).toLowerCase() !== 'cache-control') return false;
    cacheControl = String(headers[name] || '');
    return true;
  });
  var match = /(?:^|,)\s*max-age=(\d+)\b/i.exec(cacheControl);
  var seconds = match ? Number(match[1]) : GOOGLE_IDENTITY_JWKS_CACHE_SECONDS_;
  if (!Number.isInteger(seconds)) seconds = GOOGLE_IDENTITY_JWKS_CACHE_SECONDS_;
  var age = 0;
  Object.keys(headers || {}).some(function (name) {
    if (String(name).toLowerCase() !== 'age') return false;
    var parsedAge = Number(String(headers[name] || '').trim());
    if (Number.isInteger(parsedAge) && parsedAge > 0) age = parsedAge;
    return true;
  });
  seconds = Math.max(0, seconds - age);
  return Math.max(0, Math.min(GOOGLE_IDENTITY_JWKS_CACHE_SECONDS_, seconds));
}

function findGoogleIdentityJwk_(keys, kid) {
  var matches = (keys || []).filter(function (key) { return key.kid === kid; });
  return matches.length === 1 ? matches[0] : null;
}

function verifyRs256Signature_(signedContent, encodedSignature, jwk) {
  try {
    var bigintZero = BigInt(0);
    var bigintOne = BigInt(1);
    var bigintThree = BigInt(3);
    var modulusBytes = decodeBase64UrlBytes_(jwk.n);
    var exponentBytes = decodeBase64UrlBytes_(jwk.e);
    var signatureBytes = decodeBase64UrlBytes_(encodedSignature);
    if (modulusBytes.length < 256 || modulusBytes.length > 512 ||
        exponentBytes.length < 1 || exponentBytes.length > 4 ||
        signatureBytes.length !== modulusBytes.length) return false;

    var modulus = bytesToBigInt_(modulusBytes);
    var exponent = bytesToBigInt_(exponentBytes);
    var signature = bytesToBigInt_(signatureBytes);
    if (modulus <= bigintZero || exponent < bigintThree ||
        (exponent & bigintOne) !== bigintOne ||
        signature < bigintZero || signature >= modulus) return false;
    var encodedMessage = bigIntToFixedBytes_(modularExponentiation_(signature, exponent, modulus),
      modulusBytes.length);
    if (!encodedMessage || encodedMessage[0] !== 0x00 || encodedMessage[1] !== 0x01) return false;

    var separatorIndex = 2;
    while (separatorIndex < encodedMessage.length && encodedMessage[separatorIndex] === 0xff) {
      separatorIndex += 1;
    }
    if (separatorIndex < 10 || encodedMessage[separatorIndex] !== 0x00) return false;
    separatorIndex += 1;
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      signedContent,
      Utilities.Charset.UTF_8
    ).map(function (byte) { return byte & 0xff; });
    var expected = SHA256_DIGEST_INFO_PREFIX_.concat(digest);
    if (encodedMessage.length - separatorIndex !== expected.length) return false;
    var difference = 0;
    for (var index = 0; index < expected.length; index += 1) {
      difference |= encodedMessage[separatorIndex + index] ^ expected[index];
    }
    return difference === 0;
  } catch (error) {
    return false;
  }
}

function decodeGoogleJwtJson_(segment) {
  try {
    var parsed = JSON.parse(utf8BytesToString_(decodeBase64UrlBytes_(segment)));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function decodeBase64UrlBytes_(value) {
  var encoded = String(value || '');
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error('Invalid base64url value');
  }
  var standard = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (standard.length % 4) standard += '=';
  return Utilities.base64Decode(standard).map(function (byte) { return byte & 0xff; });
}

function utf8BytesToString_(bytes) {
  var escaped = bytes.map(function (byte) {
    return '%' + (byte & 0xff).toString(16).padStart(2, '0');
  }).join('');
  return decodeURIComponent(escaped);
}

function bytesToBigInt_(bytes) {
  var hex = bytes.map(function (byte) {
    return (byte & 0xff).toString(16).padStart(2, '0');
  }).join('');
  return BigInt('0x' + (hex || '0'));
}

function bigIntToFixedBytes_(value, length) {
  var hex = value.toString(16);
  if (hex.length > length * 2) return null;
  hex = hex.padStart(length * 2, '0');
  var bytes = [];
  for (var index = 0; index < hex.length; index += 2) {
    bytes.push(parseInt(hex.slice(index, index + 2), 16));
  }
  return bytes;
}

function modularExponentiation_(base, exponent, modulus) {
  var bigintZero = BigInt(0);
  var bigintOne = BigInt(1);
  var result = bigintOne;
  var factor = base % modulus;
  var power = exponent;
  while (power > bigintZero) {
    if (power & bigintOne) result = (result * factor) % modulus;
    power >>= bigintOne;
    factor = (factor * factor) % modulus;
  }
  return result;
}
