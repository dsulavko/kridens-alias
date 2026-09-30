import "dotenv/config";
import { createServer } from "node:http";
import { handleHttpRequest } from "./http.js";
import { RoomManager } from "./rooms/roomManager.js";
import { attachWebSocketServer } from "./ws/server.js";

const port = Number(process.env.PORT ?? 8787);
const roomManager = new RoomManager();

const httpServer = createServer((req, res) => {
  const handled = handleHttpRequest(req, res, roomManager);
  if (!handled) {
    res.statusCode = 404;
    res.end();
  }
});

attachWebSocketServer(httpServer, roomManager);

httpServer.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
