import { expect, test } from 'bun:test';

import { buildAwsStackConfig } from './buildAwsStackConfig.js';

test('buildAwsStackConfig: per-stack region overrides the shared awsConfig region (the multi-region pivot)', () => {
    const config = buildAwsStackConfig({
        awsConfig: { region: 'eu-central-1' },
        region: 'us-east-1',
    });

    expect(config['aws:region']).toBe('us-east-1');
});

test('buildAwsStackConfig: falls back to the awsConfig region when there is no per-stack region', () => {
    const config = buildAwsStackConfig({ awsConfig: { region: 'eu-central-1' } });

    expect(config['aws:region']).toBe('eu-central-1');
});

test('buildAwsStackConfig: writes the region even with no awsConfig (real-AWS path)', () => {
    const config = buildAwsStackConfig({ region: 'us-east-1' });

    expect(config['aws:region']).toBe('us-east-1');
});

test('buildAwsStackConfig: serializes string + boolean fields and endpoints', () => {
    const config = buildAwsStackConfig({
        awsConfig: {
            region: 'eu-central-1',
            skipCredentialsValidation: true,
            endpoints: { s3: 'http://localhost:4566' },
        },
    });

    expect(config['aws:skipCredentialsValidation']).toBe('true');
    expect(config['aws:endpoints']).toEqual([{ s3: 'http://localhost:4566' }]);
});
