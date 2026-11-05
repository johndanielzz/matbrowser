import http from "node:http";
import { env } from "../server/config/env.js";
import { handleRequest } from "../server/nativeApp.js";
import { logger } from "../server/utils/logger.js";

const server = http.createServer((req, res) => {
  handleRequest(req, res);
});

server.timeout = 300000; // 5 minutes timeout

server.listen(env.port, () => {
  logger.info("server_started", { url: `http://localhost:${env.port}` });
});

process.on("SIGTERM", () => {
  logger.info("server_stopping");
  server.close(() => process.exit(0));
});
