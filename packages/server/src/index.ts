import "dotenv/config";
import { createServer } from "node:http";
import { handleHttpRequest } from "./http.js";
import { attachWebSocketServer } from "./ws/server.js";

const port = Number(process.env.PORT ?? 8787);

const httpServer = createServer((req, res) => {
  const handled = handleHttpRequest(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.end();
  }
});

attachWebSocketServer(httpServer);

httpServer.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
