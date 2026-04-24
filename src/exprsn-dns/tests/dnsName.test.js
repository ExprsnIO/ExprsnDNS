const dnsName = require('../utils/dnsName');

describe('dnsName', () => {
  test('normalize lowercases and strips trailing dot', () => {
    expect(dnsName.normalize('Example.COM.')).toBe('example.com');
  });

  test('isValid rejects empty and oversized names', () => {
    expect(dnsName.isValid('')).toBe(false);
    expect(dnsName.isValid('a'.repeat(260))).toBe(false);
    expect(dnsName.isValid('ok.example.com')).toBe(true);
  });

  test('isSubdomainOf handles apex and children', () => {
    expect(dnsName.isSubdomainOf('example.com', 'example.com')).toBe(true);
    expect(dnsName.isSubdomainOf('www.example.com', 'example.com')).toBe(true);
    expect(dnsName.isSubdomainOf('example.org', 'example.com')).toBe(false);
  });

  test('relativize returns @ for apex and strips zone suffix', () => {
    expect(dnsName.relativize('example.com', 'example.com')).toBe('@');
    expect(dnsName.relativize('www.example.com', 'example.com')).toBe('www');
    expect(dnsName.relativize('a.b.example.com', 'example.com')).toBe('a.b');
  });

  test('absolutize expands @ and relative names', () => {
    expect(dnsName.absolutize('@', 'example.com')).toBe('example.com');
    expect(dnsName.absolutize('www', 'example.com')).toBe('www.example.com');
    expect(dnsName.absolutize('www.example.com', 'example.com')).toBe('www.example.com');
  });
});
