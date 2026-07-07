/**
 * Extracts the top-level domain (TLD) from a domain string.
 * For example, extracts 'example.com' from 'subdomain.example.com'.
 * @util
 *
 * @param domain - The domain string to extract the TLD from
 * @returns The top-level domain, or null if no valid TLD is found
 *
 * @example
 * ```typescript
 * getTopLevelDomain('subdomain.example.com'); // 'example.com'
 * getTopLevelDomain('example.com'); // 'example.com'
 * getTopLevelDomain('invalid'); // null
 * ```
 */
export function getTopLevelDomain(domain: string) {
    const topLevelDomainRegex = /(.*\.)?([\w_-]*\.[\w]*)/;
    const topLevelDomainMatch = topLevelDomainRegex.exec(domain);
    if (!topLevelDomainMatch) {
        return null;
    }

    return topLevelDomainMatch[2];
}
