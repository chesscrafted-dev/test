const mongoose = require('mongoose');
const messageSchema = new mongoose.Schema({
  chat_id: { type: String, required: true, index: true },
  sender_id: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['TEXT', 'MEDIA', 'SYSTEM'], 
    default: 'TEXT' 
  },
  // Encryption data (only for TEXT/MEDIA)
  ciphertext: { type: String },
  iv: { type: String },
  auth_tag: { type: String },
  // Media data
  is_media: { type: Boolean, default: false },
  media_url: { type: String },
  // System data
  system_action: { 
    type: String, 
    enum: ['THEME_CHANGE', 'CALL_START', 'CALL_END', 'CALL_MISSED'] 
  },
  theme_name: { type: String },
  timestamp: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Message', messageSchema);
