const rdata = require('../services/rdata');

describe('rdata.normalizeRdata', () => {
  test('A requires IPv4', () => {
    expect(rdata.normalizeRdata('A', '10.0.0.1').data.address).toBe('10.0.0.1');
    expect(() => rdata.normalizeRdata('A', 'not-ip')).toThrow();
  });

  test('AAAA requires IPv6 with colons', () => {
    const out = rdata.normalizeRdata('AAAA', 'fe80::1');
    expect(out.data.address).toBe('fe80::1');
    expect(() => rdata.normalizeRdata('AAAA', '1.2.3.4')).toThrow();
  });

  test('MX parses priority and exchange', () => {
    const out = rdata.normalizeRdata('MX', '10 mail.example.com');
    expect(out.data.priority).toBe(10);
    expect(out.data.exchange).toBe('mail.example.com');
  });

  test('TXT quotes strings', () => {
    const out = rdata.normalizeRdata('TXT', '"v=spf1 -all"');
    expect(out.data.data).toEqual(['v=spf1 -all']);
  });

  test('SRV parses all 4 fields', () => {
    const out = rdata.normalizeRdata('SRV', '10 20 443 target.example.com');
    expect(out.data).toMatchObject({ priority: 10, weight: 20, port: 443, target: 'target.example.com' });
  });
});

describe('rdata.recordToAnswer', () => {
  test('A record answer', () => {
    const ans = rdata.recordToAnswer(
      { type: 'A', rdata: '10.0.0.1', data: { address: '10.0.0.1' }, ttl: 300, class: 'IN' },
      'host.example.com',
      3600
    );
    expect(ans).toMatchObject({ name: 'host.example.com', type: 'A', address: '10.0.0.1', ttl: 300 });
  });

  test('falls back to default TTL', () => {
    const ans = rdata.recordToAnswer(
      { type: 'A', rdata: '10.0.0.1', data: { address: '10.0.0.1' }, ttl: null },
      'host.example.com',
      3600
    );
    expect(ans.ttl).toBe(3600);
  });
});
