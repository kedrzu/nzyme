import data from './data.json' with { type: 'json' };

export const handler = () => data.marker;
