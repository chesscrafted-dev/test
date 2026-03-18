const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Message = require('../models/Message');

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Token invalid' });
    req.user = decoded;
    next();
  });
};

router.get('/:chat_id', authenticate, async (req, res) => {
  console.log(`[REST] Fetching history for chat_id: ${req.params.chat_id} by user: ${req.user.user_id}`);
  try {
    const messages = await Message.find({ chat_id: req.params.chat_id }).sort({ timestamp: 1 });
    console.log(`[REST] Found ${messages.length} messages for ${req.params.chat_id}`);
    res.json(messages);
  } catch (err) {
    console.error(`[REST] Error fetching history:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
