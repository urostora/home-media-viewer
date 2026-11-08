// Log only explicitly selected metadata. Never serialize request bodies, headers,
// exception messages/stacks/causes, or nested context (including custom toJSON).
const identifierPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

const getIdentifiers = (context: object | null | undefined): Record<string, string> => {
    const identifiers: Record<string, string> = {};
    for (const field of ['id', 'userId', 'albumId', 'fileId'] as const) {
        const value = context != null ? Object.getOwnPropertyDescriptor(context, field)?.value : undefined;
        if (typeof value === 'string' && identifierPattern.test(value)) identifiers[field] = value;
    }
    return identifiers;
};

export const logApiFailure = (
    // Task labels must be application constants, never request values.
    task: string,
    httpStatus: number,
    error: unknown,
    context?: object | null,
): void => {
    const code =
        typeof error === 'object' && error !== null ? Object.getOwnPropertyDescriptor(error, 'code')?.value : undefined;

    console.warn({
        event: 'api.error',
        task,
        httpStatus,
        errorKind: error instanceof Error ? 'exception' : 'unknown',
        ...(typeof code === 'string' && /^P\d{4}$/.test(code) ? { code } : {}),
        ...getIdentifiers(context),
    });
};

export const logLoginSuccess = (userId: string): void => {
    console.log({ event: 'auth.login.success', ...getIdentifiers({ userId }) });
};

export const logLoginOutcome = (outcome: 'failure' | 'limited' | 'unavailable'): void => {
    if (outcome !== 'failure' && outcome !== 'limited' && outcome !== 'unavailable') return;
    console.log({ event: `auth.login.${outcome}` });
};
