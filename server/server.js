// --- Dependencies ---
const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require("cors");
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// --- Middleware Setup ---
app.use(cors());
app.use(express.json());
// app.use(express.static(path.join(__dirname, '../client/build')));

// --- Server and Socket.io Initialization ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// --- In-Memory State Management ---
const socketID_to_Users_Map = {};
const roomID_to_Code_Map = {};

// --- Google AI Setup ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- API Routes ---

/**
 * ===============================
 * 🚀 AI Feedback Endpoint (Using Gemini)
 * ===============================
 */
app.post('/ask-ai', async (req, res) => {
  const { code, prompt } = req.body;

  if (!code || !prompt) {
    return res.status(400).json({ error: 'Code and a prompt are required.' });
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    const fullPrompt = `${prompt}:\n\n\`\`\`\n${code}\n\`\`\``;
    
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const aiResponse = response.text();
    
    res.json({ response: aiResponse });

  } catch (error) {
    console.error("Error with Google Gemini API:", error);
    res.status(500).json({ error: 'Failed to get a response from the AI assistant.' });
  }
});

/**
 * ===============================
 * 🚀 Code Execution Endpoint
 * ===============================
 */
app.post('/execute', async (req, res) => {
  const { language = 'javascript', code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Code is required.' });
  }

  const languageMap = {
    'javascript': 93,
    'python': 71,
    'java': 62,
    'c_cpp': 54,
    'typescript': 74,
    'golang': 60
  };

  const languageId = languageMap[language];
  if (!languageId) {
    return res.status(400).json({ error: 'Unsupported language.' });
  }

  const options = {
    method: 'POST',
    url: 'https://judge0-ce.p.rapidapi.com/submissions',
    params: { base64_encoded: 'false', fields: '*' },
    headers: {
      'content-type': 'application/json',
      'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
      'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
    },
    data: {
      language_id: languageId,
      source_code: code,
    }
  };

  try {
    const submissionResponse = await axios.request(options);
    const token = submissionResponse.data.token;

    let output = null;
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const resultResponse = await axios.request({
        method: 'GET',
        url: `https://judge0-ce.p.rapidapi.com/submissions/${token}`,
        params: { base64_encoded: 'false', fields: '*' },
        headers: {
          'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
          'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
        }
      });

      const statusId = resultResponse.data.status.id;
      if (statusId > 2) {
        output = resultResponse.data;
        break;
      }
    }

    if (!output) {
      output = {
        status: { description: 'Timed Out' },
        stderr: 'Execution timed out. Your code took too long to run.'
      };
    }

    res.json(output);

  } catch (error) {
    const errorMessage = error.response ? error.response.data : error.message;
    console.error("Error executing code:", errorMessage);
    res.status(500).json({ error: 'An error occurred while executing the code.' });
  }
});


// --- Helper Functions for Socket.IO ---

async function getUsersinRoom(roomId, io) {
  const socketList = await io.in(roomId).allSockets();
  const userslist = [];
  socketList.forEach((socketId) => {
    if (socketId in socketID_to_Users_Map) {
      userslist.push(socketID_to_Users_Map[socketId].username);
    }
  });
  return userslist;
}

async function handleUserLeave(io, socket, roomId) {
  if (socket.id in socketID_to_Users_Map) {
    const leavingUser = socketID_to_Users_Map[socket.id];
    socket.to(roomId).emit("member left", { username: leavingUser.username });
    delete socketID_to_Users_Map[socket.id];

    const userslist = await getUsersinRoom(roomId, io);
    io.in(roomId).emit("updating client list", { userslist: userslist });

    if (userslist.length === 0) {
      delete roomID_to_Code_Map[roomId];
      console.log(`Room ${roomId} deleted as it is now empty.`);
    }
  }
}

// --- Socket.io Connection Logic ---

io.on('connection', function (socket) {
  console.log('A user connected:', socket.id);

  socket.on("when a user joins", async ({ roomId, username }) => {
    try {
      const existingUsers = await getUsersinRoom(roomId, io);
      if (existingUsers.includes(username)) {
        socket.emit("join error", { message: "This username is already taken." });
        return;
      }

      socketID_to_Users_Map[socket.id] = { username, roomId };
      socket.join(roomId);

      if (roomId in roomID_to_Code_Map) {
        const { code, languageUsed } = roomID_to_Code_Map[roomId];
        if (languageUsed) socket.emit("on language change", { languageUsed });
        if (code) socket.emit("on code change", { code });
      }

      const userslist = await getUsersinRoom(roomId, io);
      io.in(roomId).emit("updating client list", { userslist: userslist });
      socket.to(roomId).emit("new member joined", { username });

    } catch (error) {
      console.error("Error in 'when a user joins' event:", error);
      socket.emit("join error", { message: "An error occurred while joining." });
    }
  });

  socket.on("update language", ({ roomId, languageUsed }) => {
    if (!roomID_to_Code_Map[roomId]) roomID_to_Code_Map[roomId] = {};
    roomID_to_Code_Map[roomId]['languageUsed'] = languageUsed;
    socket.to(roomId).emit("on language change", { languageUsed });
  });

  socket.on("update code", ({ roomId, code }) => {
    if (!roomID_to_Code_Map[roomId]) roomID_to_Code_Map[roomId] = {};
    roomID_to_Code_Map[roomId]['code'] = code;
    socket.to(roomId).emit("on code change", { code });
  });
  //Typing effect
  socket.on('typing-start', ({ roomId, username }) => {
    socket.to(roomId).emit('user-typing-start', { username });
  });
  socket.on('typing-stop', ({ roomId, username }) => {
    socket.to(roomId).emit('user-typing-stop', { username });
  });

  socket.on("leave room", ({ roomId }) => {
    socket.leave(roomId);
    handleUserLeave(io, socket, roomId);
  });

  socket.on("disconnecting", () => {
    socket.rooms.forEach(roomId => {
      if (roomId !== socket.id) {
        handleUserLeave(io, socket, roomId);
      }
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

/**
 * ===============================
 * SPA Fallback - IMPORTANT: Must be last
 * ===============================
 */
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, '../client/build/index.html'));
// });


// --- Server Listening ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, function () {
  console.log(`🚀 Server listening on port: ${PORT}`);
});