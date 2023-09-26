import messageConsumer from '@/backgroundProcesses/messageConsumer';

const format =  require('util').format;

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        console.log(`App STARTED on SERVER, format: ${format('%s:%i', 'str', 10)}`);
        await messageConsumer.init();
    } else {
        console.log('App STARTED on CLIENT - Nothing to do');
    }
}