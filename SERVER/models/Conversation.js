const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  chat_id: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  participants: [{ 
    type: String, // user_id
    index: true 
  }],
  theme: { 
    type: String, 
    default: 'midnight' 
  },
  last_message_at: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);
