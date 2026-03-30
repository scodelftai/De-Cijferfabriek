import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // In-memory store for rooms
  const rooms = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join_room", (roomId) => {
      socket.join(roomId);
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          status: 'waiting',
          laksId: '',
          parentsId: '',
          tutorsId: '',
          teachersId: '',
          ministerId: '',
          laksProposal: null,
          parentsProposal: null,
          tutorsProposal: null,
          teachersProposal: null,
          ministerProposal: null,
          currentAgreement: null,
          logs: ['Kamer aangemaakt. Wachten op spelers...'],
          activePowerTools: {},
          votes: {},
          chatMessages: []
        });
      }
      io.to(roomId).emit("room_update", rooms.get(roomId));
    });

    socket.on("send_message", ({ roomId, message }) => {
      if (rooms.has(roomId)) {
        const room = rooms.get(roomId);
        room.chatMessages = [...(room.chatMessages || []), message];
        rooms.set(roomId, room);
        io.to(roomId).emit("room_update", room);
      }
    });

    socket.on("update_room", ({ roomId, updates }) => {
      if (rooms.has(roomId)) {
        const room = rooms.get(roomId);
        const newRoom = { ...room, ...updates };
        
        // Handle arrayUnion for logs
        if (updates.logs && Array.isArray(updates.logs)) {
          newRoom.logs = [...room.logs, ...updates.logs];
        }

        rooms.set(roomId, newRoom);
        io.to(roomId).emit("room_update", newRoom);
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (req, res) => {
      let html = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');
      const apiKey = process.env.GEMINI_API_KEY || '';
      html = html.replace('<head>', `<head><script>window.ENV = { GEMINI_API_KEY: "${apiKey}" };</script>`);
      res.send(html);
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
