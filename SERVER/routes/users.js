const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../utils/authMiddleware');

const Conversation = require('../models/Conversation');

// GET /api/users/recent - Get users the current user has chatted with
router.get('/recent', auth, async (req, res) => {
  try {
    const currentUserId = req.user.user_id;
    const conversations = await Conversation.find({ participants: currentUserId })
      .sort({ last_message_at: -1 })
      .limit(20);

    // Extract all unique participant IDs (excluding current user)
    const recentUserIds = new Set();
    const chatMetadata = {}; // Map chat_id/user_id to theme

    conversations.forEach(c => {
      const otherId = c.participants.find(id => id !== currentUserId);
      if (otherId) {
          recentUserIds.add(otherId);
          chatMetadata[otherId] = { theme: c.theme, chat_id: c.chat_id };
      }
    });

    // Fetch user details for these IDs
    const users = await User.find({ user_id: { $in: Array.from(recentUserIds) } })
      .select('user_id username firstName lastName profilePictureUrl');

    // Combine with metadata
    const result = users.map(u => ({
      ...u.toObject(),
      theme: chatMetadata[u.user_id].theme,
      chat_id: chatMetadata[u.user_id].chat_id
    }));

    // Sort by original conversation order
    const sortedResult = Array.from(recentUserIds).map(id => result.find(r => r.user_id === id)).filter(Boolean);

    res.json(sortedResult);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/profile - Get current user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findOne({ user_id: req.user.user_id }).select('-otp -otp_expiry');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/profile - Update user profile and set isProfileComplete: true
router.put('/profile', auth, async (req, res) => {
  const { username, firstName, lastName, gender, bio } = req.body;

  try {
    // Check if username is already taken by another user
    if (username) {
      const existingUser = await User.findOne({ 
        username: username.toLowerCase(), 
        user_id: { $ne: req.user.user_id } 
      });
      if (existingUser) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
    }

    const updatedUser = await User.findOneAndUpdate(
      { user_id: req.user.user_id },
      {
        username: username ? username.toLowerCase() : undefined,
        firstName,
        lastName,
        gender,
        bio,
        isProfileComplete: true
      },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        username: updatedUser.username,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        isProfileComplete: updatedUser.isProfileComplete
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/search?username=... - Partial search for users
router.get('/search', auth, async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ error: 'Username query parameter is required' });
    }

    // Search for users with partial, case-insensitive matching
    const users = await User.find({
      username: { $regex: username, $options: 'i' }
    }).select('user_id username firstName profilePictureUrl');

    res.json(users);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Server error during search' });
  }
});

// GET /api/users/search/:username - Search for user by exact @username
router.get('/search/:username', auth, async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const user = await User.findOne({ username }).select('user_id username firstName profilePictureUrl');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
