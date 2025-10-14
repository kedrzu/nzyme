/**
 * Assert that an environment variable is set.
 * @param key - The name of the environment variable.
 * @param env - The environment variables to check.
 * @returns The value of the environment variable.
 * @throws An error if the environment variable is not set.
 */
export function assertEnv(key: string, env: NodeJS.ProcessEnv = process.env) {
    const value = env[key];
    if (!value) {
        throw new Error(`Environment variable ${key} is not set`);
    }

    return value;
}
