// Harness-only query interception. Install before loading the shared client so
// application helpers and transaction clients inherit the same extension.
module.exports = function instrumentPrisma(requireApp) {
  const clientModule = requireApp('@prisma/client');
  const hooks = [];
  requireApp.cache[requireApp.resolve('@prisma/client')].exports = {
    ...clientModule,
    PrismaClient: class extends clientModule.PrismaClient {
      constructor(options) {
        super(options);
        return this.$extends({
          query: {
            $allOperations({ model, operation, args, query }) {
              const params = { model, action: operation.replace(/^\$/, ''), args };
              const dispatch = (index, current) => index === hooks.length
                ? query(current.args)
                : hooks[index](current, next => dispatch(index + 1, next));
              return Promise.resolve().then(() => dispatch(0, params)).catch(error => {
                if (process.env.HMV_TRACE_DB_ERRORS === 'true') {
                  const cause = error.meta?.driverAdapterError?.cause;
                  console.error({ operation, model, code: error.code, driverKind: cause?.kind, driverCode: cause?.originalCode });
                }
                throw error;
              });
            },
          },
        });
      }
    },
  };
  return { use: hook => hooks.push(hook) };
};
