/**
 * Whether `hostname` is `domain` itself or one of its subdomains (`a.example.com` of `example.com`).
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function isHostOf(hostname: string, domain: string) {
    return hostname === domain || hostname.endsWith(`.${domain}`);
}
