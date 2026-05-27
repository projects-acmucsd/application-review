import { createServer } from 'node:http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { createCollaborationServer } from './modules/collaboration/collaboration.server.js';

const app = createApp();
const server = createServer(app);

createCollaborationServer(server);

server.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
});
