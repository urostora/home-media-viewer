import { BlockList, isIP } from 'node:net';
import type { NextApiRequest } from 'next';

export const normalizeIP = (input: string | undefined): string | null => {
    if (input === undefined || input.includes('%') || isIP(input) === 0) return null;
    if (isIP(input) === 4) return input;
    const canonical = new URL(`http://[${input}]/`).hostname.slice(1, -1).toLowerCase();
    const [left, right] = canonical.split('::');
    const start = left ? left.split(':') : [];
    const end = right ? right.split(':') : [];
    const words = right === undefined ? start : [...start, ...Array(8 - start.length - end.length).fill('0'), ...end];
    const numbers = words.map((word) => parseInt(word, 16));
    if (numbers.slice(0, 5).every((word) => word === 0) && numbers[5] === 65535) {
        return [numbers[6] >> 8, numbers[6] & 255, numbers[7] >> 8, numbers[7] & 255].join('.');
    }
    return numbers.map((word) => word.toString(16)).join(':');
};

const trustedProxies = (): BlockList | null => {
    const enabled = process.env.LOGIN_TRUST_FORWARDED_HEADERS;
    if (enabled === undefined || enabled === '' || enabled === 'false') return null;
    if (enabled !== 'true') throw new Error('Invalid login forwarding configuration');
    const value = process.env.LOGIN_TRUSTED_PROXY_CIDRS ?? '';
    if (value.length === 0 || value.length > 8192) throw new Error('Explicit proxy allowlist required');
    const entries = value.split(',');
    if (entries.length > 64) throw new Error('Too many trusted proxy ranges');
    const list = new BlockList();
    for (const entry of entries) {
        const [rawAddress, rawPrefix, extra] = entry.trim().split('/');
        const address = normalizeIP(rawAddress);
        const family = address === null ? 0 : isIP(address);
        const prefix = rawPrefix === undefined ? (family === 4 ? 32 : 128) : Number(rawPrefix);
        if (
            address === null ||
            extra !== undefined ||
            (rawPrefix !== undefined && !/^\d{1,3}$/.test(rawPrefix)) ||
            !Number.isInteger(prefix) ||
            prefix < 0 ||
            prefix > (family === 4 ? 32 : 128)
        )
            throw new Error('Invalid proxy range');
        list.addSubnet(address, prefix, family === 4 ? 'ipv4' : 'ipv6');
    }
    return list;
};
const headerIPs = (value: string | string[] | undefined): string[] | null => {
    if (typeof value !== 'string' || value.length > 2048) return null;
    const entries = value.split(',');
    if (entries.length > 16) return null;
    const ips = entries.map((entry) => normalizeIP(entry.trim()));
    return ips.every((ip): ip is string => ip !== null) ? ips : null;
};

export const loginClient = (req: Pick<NextApiRequest, 'socket' | 'headers'>): string => {
    const proxies = trustedProxies();
    const peer = normalizeIP(req.socket.remoteAddress);
    const trusted = (ip: string): boolean => proxies?.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6') === true;
    let client = peer;
    if (peer !== null && trusted(peer)) {
        const forwarded = req.headers['x-forwarded-for'];
        const real = req.headers['x-real-ip'];
        const chain = forwarded !== undefined ? headerIPs(forwarded) : real !== undefined ? headerIPs(real) : [peer];
        if (chain === null || (forwarded === undefined && real !== undefined && chain.length !== 1)) return 'unknown';
        // Walk from the trusted socket toward the client; never trust an arbitrary
        // leftmost address that the real client could have supplied.
        for (let index = chain.length - 1; index >= 0 && client !== null && trusted(client); index--)
            client = chain[index];
    }
    if (client === null) return 'unknown';
    // One budget per IPv6 /64; changing interface addresses cannot evade it.
    return isIP(client) === 6 ? `${client.split(':').slice(0, 4).join(':')}::/64` : client;
};
