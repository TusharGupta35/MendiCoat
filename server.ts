import { createServer } from 'node:http';
import next from 'next';
import { createSocketServer } from './src/socket/server';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function startServer() {
  await app.prepare();

  const httpServer = createServer((request, response) => handle(request, response));
  const io = createSocketServer(httpServer);

  let isShuttingDown = false;
  const shutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n> Received ${signal}; closing server...`);

    io.close(() => {
      httpServer.close(() => process.exit(0));
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error('Unable to start the server', error);
  process.exit(1);
});
