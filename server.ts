import { createServer } from 'node:http';
import os from 'node:os';
import next from 'next';
import { createSocketServer } from './src/socket/server';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function startServer() {
  await app.prepare();

  const httpServer = createServer((request, response) => {
    handle(request, response);
  });

  const io = createSocketServer(httpServer);

  let isShuttingDown = false;

  const shutdown = (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n> Received ${signal}; closing server...`);

  httpServer.close(() => {
    io.close();
    process.exit(0);
  });

  // Force exit after 5 seconds
  setTimeout(() => process.exit(1), 5000).unref();
};

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  httpServer.listen(port, hostname, () => {
    const interfaces = os.networkInterfaces();

    let networkAddress: string | undefined;

    for (const iface of Object.values(interfaces)) {
      if (!iface) continue;

      for (const address of iface) {
        if (address.family === 'IPv4' && !address.internal) {
          networkAddress = address.address;
          break;
        }
      }

      if (networkAddress) break;
    }

    console.log('> Ready');
    console.log(`  Local:   http://localhost:${port}`);

    if (networkAddress) {
      console.log(`  Network: http://${networkAddress}:${port}`);
    } else {
      console.log('  Network: Not available');
    }
  });
}

startServer().catch((error) => {
  console.error('Unable to start the server', error);
  process.exit(1);
});