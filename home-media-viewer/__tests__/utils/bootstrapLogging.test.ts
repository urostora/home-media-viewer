jest.mock('../../src/utils/prisma/clientFactory', () => ({
    createPrismaClient: jest.fn().mockImplementation(() => ({
        user: {
            findFirst: jest.fn().mockRejectedValue(new Error('SYNTHETIC_BOOTSTRAP_CREDENTIAL_SENTINEL')),
        },
        $disconnect: jest.fn().mockResolvedValue(undefined),
    })),
}));

it('reports bootstrap failure without serializing a credential-bearing database error', async () => {
    const previousEmail = process.env.ADMIN_EMAIL;
    const previousPassword = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_EMAIL = 'bootstrap@example.invalid';
    process.env.ADMIN_PASSWORD = 'Synthetic-P4ssword!';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let exit: jest.SpyInstance | undefined;
    try {
        await new Promise<void>((resolve) => {
            exit = jest.spyOn(process, 'exit').mockImplementation(() => {
                resolve();
                return undefined as never;
            });
            jest.isolateModules(() => {
                // The script runs main at import; persistence and process exit are isolated here.
                jest.requireActual('../../prisma/seed');
            });
        });
        expect(exit).toHaveBeenCalledWith(1);
        expect(warn).toHaveBeenCalledWith({
            event: 'api.error',
            task: 'bootstrap administrator',
            httpStatus: 500,
            errorKind: 'exception',
        });
        expect(error).not.toHaveBeenCalled();
        expect(JSON.stringify(warn.mock.calls)).not.toContain('SYNTHETIC_BOOTSTRAP_CREDENTIAL_SENTINEL');
    } finally {
        if (previousEmail === undefined) delete process.env.ADMIN_EMAIL;
        else process.env.ADMIN_EMAIL = previousEmail;
        if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
        else process.env.ADMIN_PASSWORD = previousPassword;
        jest.restoreAllMocks();
    }
});
