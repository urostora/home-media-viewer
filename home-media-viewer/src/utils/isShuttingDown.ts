export const isShuttingDownHandler = (() => {
  let isShuttingDown = false;

  const setIsShuttingDown = (): void => {
    isShuttingDown = true;
  };

  return {
    setIsShuttingDown,
    isShuttingDown: () => isShuttingDown || process.env.HMV_SHUTTING_DOWN === '1',
  };
})();

process.on('SIGTERM', () => {
  console.log('Shutting down - SIGTERM');
  isShuttingDownHandler.setIsShuttingDown();
});
process.on('SIGINT', () => {
  console.log('Shutting down - SIGINT');
  isShuttingDownHandler.setIsShuttingDown();
});
process.on('SIGHUP', () => {
  console.log('Shutting down - SIGHUP');
  isShuttingDownHandler.setIsShuttingDown();
});
