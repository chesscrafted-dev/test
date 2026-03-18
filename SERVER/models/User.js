const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  },
  user_id: { 
    type: String, 
    required: true, 
    unique: true 
  },
  username: { 
    type: String, 
    unique: true, 
    lowercase: true, 
    sparse: true, 
    index: true,
    trim: true
  },
  firstName: { type: String },
  lastName: { type: String },
  gender: { 
    type: String, 
    enum: ['Male', 'Female', 'Non-binary', 'Prefer not to say'] 
  },
  bio: { 
    type: String, 
    maxlength: 160 
  },
  profilePictureUrl: { 
    type: String, 
    default: 'https://ui-avatars.com/api/?name=User&background=6366f1&color=fff' 
  },
  isProfileComplete: { 
    type: Boolean, 
    default: false 
  },
  otp: String,
  otp_expiry: Date,
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
