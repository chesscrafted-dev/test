import { io, Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

let socket: Socket | null = null;

export const initiateSocket = (token: string) => {
  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10
  });
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const joinChat = (chatId: string) => {
  if (socket) socket.emit("join_chat", chatId);
};

export const sendMessage = (payload: any) => {
  if (socket) socket.emit("send_message", payload);
};

export const sendThemeChange = (chatId: string, themeName: string) => {
  if (socket) socket.emit("change_theme", { chat_id: chatId, theme_name: themeName });
};

export const subscribeToMessages = (cb: (msg: any) => void) => {
  if (!socket) return;
  socket.off("receive_message");
  socket.on("receive_message", cb);
};

export const unsubscribeFromMessages = () => {
  if (socket) socket.off("receive_message");
};

// --- WebRTC Signaling ---

export const sendCallRequest = (to: string, offer: any, type: 'video' | 'voice', chatId: string) => {
  if (socket) socket.emit('call_request', { to, offer, type, chat_id: chatId });
};

export const sendCallAnswer = (to: string, answer: any) => {
  if (socket) socket.emit('call_answer', { to, answer });
};

export const sendIceCandidate = (to: string, candidate: any) => {
  if (socket) socket.emit('ice_candidate', { to, candidate });
};

export const sendCallReject = (to: string, chatId: string) => {
  if (socket) socket.emit('call_reject', { to, chat_id: chatId });
};

export const sendHangup = (to: string, chatId: string) => {
  if (socket) socket.emit('hangup', { to, chat_id: chatId });
};

export const onCallReceived = (cb: (data: any) => void) => {
  if (socket) {
      socket.off('call_received');
      socket.on('call_received', cb);
  }
};

export const onCallAnswered = (cb: (data: any) => void) => {
  if (socket) {
      socket.off('call_answered');
      socket.on('call_answered', cb);
  }
};

export const onIceCandidate = (cb: (data: any) => void) => {
  if (socket) {
      socket.off('ice_candidate');
      socket.on('ice_candidate', cb);
  }
};

export const onCallRejected = (cb: (data: any) => void) => {
  if (socket) {
      socket.off('call_rejected');
      socket.on('call_rejected', cb);
  }
};

export const onCallEnded = (cb: (data: any) => void) => {
  if (socket) {
      socket.off('call_ended');
      socket.on('call_ended', cb);
  }
};

export const clearCallListeners = () => {
    if (socket) {
        socket.off('call_received');
        socket.off('call_answered');
        socket.off('ice_candidate');
        socket.off('call_rejected');
        socket.off('call_ended');
    }
}
