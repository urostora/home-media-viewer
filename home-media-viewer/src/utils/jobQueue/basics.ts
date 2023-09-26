

export const queueName = {
    metaProcessing: 'hmv-metadata-processing',
};

export const actions = {
    processMetadata: 'processMetadata',
}

const rabbitHost = process.env.RABBIT_HOST;
const rabbitPort = process.env.RABBIT_AMQP_PORT ?? 5672;

export const rabbitConnection = {
    host: rabbitHost,
    port: rabbitPort,
    connectionString: `amqp://${rabbitHost}:${rabbitPort}`,
}
