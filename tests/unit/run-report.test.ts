// eslint-disable-next-line @typescript-eslint/no-var-requires
const { normaliseJestResult, renderHtmlReport } = require('../../scripts/write-run-report.cjs');

describe('run-report normalization', () => {
  test('keeps diagnostic evidence for failures but not successful response payloads', () => {
    const report = normaliseJestResult({
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTests: 1,
      numPendingTests: 0,
      testResults: [{
        name: '/workspace/tests/negative-boundary/requests-validation.test.ts',
        assertionResults: [
          {
            ancestorTitles: ['GET /requests validation and boundaries'],
            title: 'rejects invalid status query value WAITING',
            status: 'passed',
            duration: 12,
            failureMessages: [],
            response: { items: ['must not appear'] },
          },
          {
            ancestorTitles: ['GET /requests validation and boundaries'],
            title: 'clamps pageSize above 100 to 100',
            status: 'failed',
            duration: 4,
            failureMessages: ['Expected: 100\\nReceived: 101'],
          },
        ],
      }],
    }, {
      timestamp: '2026-09-23T00:00:00.000Z',
      baseUrl: 'http://localhost:4000',
      nodeVersion: 'v22.9.0',
      gitRevision: null,
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      timestamp: '2026-09-23T00:00:00.000Z',
      baseUrl: 'http://localhost:4000',
      summary: { total: 2, passed: 1, failed: 1, pending: 0 },
      tests: [
        expect.objectContaining({
          name: 'GET /requests validation and boundaries > rejects invalid status query value WAITING',
          layer: 'negative-boundary', status: 'passed', durationMs: 12,
        }),
        expect.objectContaining({
          layer: 'negative-boundary', status: 'failed', failureEvidence: 'Expected: 100\\nReceived: 101' }),
      ],
    });
    expect(report.tests[0]).not.toHaveProperty('response');
    expect(report.tests[0]).not.toHaveProperty('failureEvidence');
  });
});

describe('HTML report rendering', () => {
  test('renders a self-contained dashboard with summary, layers, and failed-test evidence', () => {
    const html = renderHtmlReport({
      timestamp: '2026-09-23T00:00:00.000Z',
      baseUrl: 'http://localhost:4000',
      nodeVersion: 'v22.9.0',
      gitRevision: null,
      summary: { total: 2, passed: 1, failed: 1, pending: 0 },
      tests: [
        { name: 'smoke check', layer: 'smoke', status: 'passed', durationMs: 5 },
        { name: 'validation check', layer: 'negative-boundary', status: 'failed', durationMs: 9, failureEvidence: 'Expected 400; received 200' },
      ],
    });

    expect(html).toContain('API Test Report');
    expect(html).toContain('Passed');
    expect(html).toContain('negative-boundary');
    expect(html).toContain('Expected 400; received 200');
    expect(html).toContain('results.json');
    expect(html).toContain('layer-section');
    expect(html).toContain('Functional');
    expect(html).toContain('Negative & boundary');
    expect(html).not.toContain('http-equiv="refresh"');
  });
});
