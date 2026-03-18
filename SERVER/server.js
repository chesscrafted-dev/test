require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');
const uploadRoutes = require('./routes/upload');
const mediaRoutes = require('./routes/media');
const Message = require('./models/Message');
const Conversation = require('./models/Conversation');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/users', uploadRoutes);
app.use('/api/media', mediaRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!token) return next(new Error('Authentication error'));
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Authentication error'));
    socket.user = decoded;
    next();
  });
});

const sendSystemMessage = async (chat_id, sender_id, action, extra = {}) => {
  const sysMsg = new Message({
    chat_id,
    sender_id,
    type: 'SYSTEM',
    system_action: action,
    ...extra
  });
  await sysMsg.save();
  io.to(chat_id).emit('receive_message', sysMsg);
  return sysMsg;
};

const updateConversation = async (chat_id, participants, theme = null) => {
    const update = { last_message_at: new Date() };
    if (theme) update.theme = theme;
    
    await Conversation.findOneAndUpdate(
        { chat_id },
        { 
            $set: update,
            $addToSet: { participants: { $each: participants } }
        },
        { upsert: true, new: true }
    );
};

io.on('connection', (socket) => {
  const userId = socket.user.user_id;
  socket.join(userId);
  console.log(`[SOCKET] User connected and joined personal room: ${userId}`);

  socket.on('join_chat', (chat_id) => {
    socket.join(chat_id);
    console.log(`[SOCKET] User ${userId} joined chat room: ${chat_id}`);
  });

  socket.on('send_message', async (payload) => {
    const { chat_id, ciphertext, iv, auth_tag, is_media, media_url, participants } = payload;
    const newMessage = new Message({
      chat_id,
      sender_id: userId,
      type: is_media ? 'MEDIA' : 'TEXT',
      ciphertext, iv, auth_tag,
      is_media: is_media || false,
      media_url: media_url || null
    });
    try {
      await newMessage.save();
      socket.to(chat_id).emit('receive_message', newMessage);
      
      // Update Conversation record for "Recent Chats"
      if (participants) {
          await updateConversation(chat_id, participants);
      }
    } catch (err) { console.error(err); }
  });

  socket.on('change_theme', async ({ chat_id, theme_name }) => {
    console.log(`[THEME] ${userId} changed theme to ${theme_name} for chat ${chat_id}`);
    await updateConversation(chat_id, [], theme_name);
    await sendSystemMessage(chat_id, userId, 'THEME_CHANGE', { theme_name });
  });

  socket.on('call_request', async ({ to, offer, type, chat_id }) => {
    console.log(`[RTC] Call request from ${userId} to ${to} in chat ${chat_id}`);
    socket.to(to).emit('call_received', { from: userId, offer, type, chat_id });
    if (chat_id) await sendSystemMessage(chat_id, userId, 'CALL_START');
  });

  socket.on('call_answer', ({ to, answer }) => {
    console.log(`[RTC] Call answered by ${userId} for user ${to}`);
    socket.to(to).emit('call_answered', { from: userId, answer });
  });

  socket.on('ice_candidate', ({ to, candidate }) => {
    socket.to(to).emit('ice_candidate', { from: userId, candidate });
  });

  socket.on('hangup', async ({ to, chat_id }) => {
    console.log(`[RTC] Hangup by ${userId} for user ${to}`);
    socket.to(to).emit('call_ended', { from: userId });
    if (chat_id) await sendSystemMessage(chat_id, userId, 'CALL_END');
  });

  socket.on('call_reject', async ({ to, chat_id }) => {
    console.log(`[RTC] Call rejected by ${userId} for user ${to}`);
    socket.to(to).emit('call_rejected', { from: userId });
    if (chat_id) await sendSystemMessage(chat_id, userId, 'CALL_MISSED');
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET] User disconnected: ${userId}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
