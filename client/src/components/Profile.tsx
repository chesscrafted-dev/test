import React, { useState, useRef, useEffect } from 'react';
import { userApi } from '../services/api';
import axios from 'axios';

interface ProfileProps {
  onComplete: () => void;
  isEdit?: boolean;
}

const Profile: React.FC<ProfileProps> = ({ onComplete, isEdit = false }) => {
  const [formData, setFormData] = useState({
    username: '',
    firstName: '',
    lastName: '',
    gender: 'Prefer not to say',
    bio: ''
  });
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(isEdit);
  const [uploadingPic, setUploadingPic] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEdit) {
        const load = async () => {
            try {
                const data = await userApi.getProfile();
                setFormData({
                    username: data.username || '',
                    firstName: data.firstName || '',
                    lastName: data.lastName || '',
                    gender: data.gender || 'Prefer not to say',
                    bio: data.bio || ''
                });
                setProfilePic(data.profilePictureUrl);
            } catch (err) {
                console.error(err);
            } finally {
                setFetchingData(false);
            }
        };
        load();
    }
  }, [isEdit]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPic(true);
    const uploadData = new FormData();
    uploadData.append('image', file);

    try {
      const token = localStorage.getItem('token');
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
      const response = await axios.put(`${BASE_URL}/users/profile-picture`, uploadData, {
        headers: { 
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${token}`
        }
      });
      setProfilePic(response.data.profilePictureUrl);
    } catch (err) {
      alert("Failed to upload image");
    } finally {
      setUploadingPic(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await userApi.updateProfile(formData);
      onComplete();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  if (fetchingData) return (
      <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-brand-primary/30 border-t-brand-primary rounded-full animate-spin mb-4" />
          <p className="text-text-muted text-sm font-bold uppercase tracking-widest">Loading Profile...</p>
      </div>
  );

  return (
    <div className="w-full max-w-xl p-8 md:p-12 bg-bg-card rounded-[3rem] shadow-2xl border border-border-subtle animate-in fade-in zoom-in duration-500 mx-4 relative">
      {isEdit && (
          <button 
            onClick={onComplete}
            className="absolute top-8 left-8 text-text-muted hover:text-text-main flex items-center gap-2 text-xs font-black uppercase tracking-widest"
          >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"/></svg>
              Back
          </button>
      )}

      <div className="text-center mb-10">
        <h2 className="text-4xl font-black text-text-main mb-3 tracking-tighter">
            {isEdit ? 'Refine Identity' : 'Create Identity'}
        </h2>
        <p className="text-text-muted text-sm font-medium">
            {isEdit ? 'Update your digital presence on the network.' : 'Initialize your presence on the encrypted network.'}
        </p>
      </div>

      <div className="flex flex-col items-center mb-10">
          <div className="relative group">
              <div className="w-32 h-32 rounded-[2.5rem] bg-bg-input border-2 border-border-subtle overflow-hidden flex items-center justify-center shadow-inner relative">
                  {profilePic ? (
                      <img src={profilePic} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                      <svg className="w-12 h-12 text-text-muted/20" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/></svg>
                  )}
                  {uploadingPic && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                  )}
              </div>
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 bg-brand-primary text-white p-2.5 rounded-2xl shadow-xl hover:scale-110 active:scale-95 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              </button>
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="image/*" />
          </div>
          <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-text-muted">Digital Avatar</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">Username</label>
            <input
              type="text"
              placeholder="Unique Alias"
              className="w-full px-5 py-4 bg-bg-input border border-border-subtle rounded-2xl text-text-main focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all font-bold shadow-inner"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">Gender</label>
            <select
              className="w-full px-5 py-4 bg-bg-input border border-border-subtle rounded-2xl text-text-main focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all font-bold shadow-inner appearance-none cursor-pointer"
              value={formData.gender}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Non-binary">Non-binary</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">First Name</label>
            <input
              type="text"
              placeholder="John"
              className="w-full px-5 py-4 bg-bg-input border border-border-subtle rounded-2xl text-text-main focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all font-bold shadow-inner"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">Last Name</label>
            <input
              type="text"
              placeholder="Doe"
              className="w-full px-5 py-4 bg-bg-input border border-border-subtle rounded-2xl text-text-main focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all font-bold shadow-inner"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">Bio (Optional)</label>
          <textarea
            placeholder="Network status..."
            rows={3}
            className="w-full px-5 py-4 bg-bg-input border border-border-subtle rounded-2xl text-text-main focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all resize-none font-medium shadow-inner"
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
          />
        </div>

        <button 
          type="submit" 
          disabled={loading || uploadingPic}
          className="w-full py-5 bg-gradient-brand text-white font-black rounded-2xl shadow-xl shadow-brand-primary/20 transition-all active:scale-[0.98] uppercase tracking-widest text-sm disabled:opacity-50"
        >
          {loading ? 'Processing...' : (isEdit ? 'Save Changes' : 'Complete Initialization')}
        </button>
      </form>
    </div>
  );
};

export default Profile;
