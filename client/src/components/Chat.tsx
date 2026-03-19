import React, { useState, useEffect, useRef } from 'react';
import { userApi, messageApi, mediaApi } from '../services/api';
import * as socketService from '../services/socket';
import { deriveKey, encryptMessage, decryptMessage, encryptFile, decryptFile } from '../utils/crypto';
import CallOverlay from './CallOverlay';

interface ChatProps {
  currentUserId: string;
}

interface Message {
  _id?: string;
  chat_id: string;
  sender_id: string;
  type: 'TEXT' | 'MEDIA' | 'SYSTEM';
  ciphertext?: string;
  iv?: string;
  auth_tag?: string;
  is_media?: boolean;
  media_url?: string;
  system_action?: 'THEME_CHANGE' | 'CALL_START' | 'CALL_END' | 'CALL_MISSED';
  theme_name?: string;
  timestamp: string;
  plaintext?: string;
  status?: 'sending' | 'sent';
}

interface RecentChatUser {
    user_id: string;
    username: string;
    firstName: string;
    lastName: string;
    profilePictureUrl: string;
    theme?: string;
    chat_id: string;
    bio?: string;
    gender?: string;
}

const SidebarSkeleton = () => (
    <div className="space-y-4 p-4">
        {[1,2,3].map(i => (
            <div key={i} className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl animate-shimmer shrink-0" />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 rounded animate-shimmer" />
                    <div className="h-2 w-32 rounded animate-shimmer opacity-50" />
                </div>
            </div>
        ))}
    </div>
);

const MessageSkeleton = () => (
    <div className="space-y-6 p-6">
        <div className="flex justify-start"><div className="w-2/3 h-12 rounded-2xl animate-shimmer rounded-tl-none" /></div>
        <div className="flex justify-end"><div className="w-1/2 h-10 rounded-2xl animate-shimmer rounded-tr-none" /></div>
        <div className="flex justify-start"><div className="w-1/3 h-10 rounded-2xl animate-shimmer rounded-tl-none" /></div>
    </div>
);

const EncryptedImage: React.FC<{ url: string; iv: string; authTag: string; cryptoKey: CryptoKey }> = ({ url, iv, authTag, cryptoKey }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    const load = async () => {
      try {
        const encryptedBlob = await mediaApi.fetchBlob(url);
        const decryptedUint8 = await decryptFile(encryptedBlob, iv, authTag, cryptoKey);
        if (decryptedUint8) {
          const blob = new Blob([decryptedUint8 as any]);
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        }
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    load();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, iv, authTag, cryptoKey]);

  if (loading) return <div className="w-48 h-36 bg-bg-input rounded-xl animate-shimmer" />;
  return <img src={src!} alt="Encrypted" className="max-w-[240px] md:max-w-xs rounded-xl border border-border-subtle shadow-md hover:scale-[1.02] transition-transform cursor-pointer" />;
};

const Chat: React.FC<ChatProps> = ({ currentUserId }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [recentChats, setRecentChats] = useState<RecentChatUser[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showIdentityCard, setShowIdentityCard] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const [activeChatKey, setActiveChatKey] = useState<CryptoKey | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);
  const [chatPassword, setChatPassword] = useState('');
  const [isDerivingKey, setIsDerivingKey] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentTheme, setCurrentTheme] = useState('midnight');
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [outgoingCall, setOutgoingCall] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchRecent = async (silent = false) => {
      if (!silent) setLoadingRecent(true);
      try {
          const data = await userApi.getRecentChats();
          setRecentChats(data);
      } catch (err) { console.error(err); } finally { setLoadingRecent(false); }
  };

  useEffect(() => {
    fetchRecent();
    socketService.onCallReceived((data) => setIncomingCall(data));
    socketService.onCallEnded(() => { setIncomingCall(null); setOutgoingCall(null); });
    socketService.onCallRejected(() => { setIncomingCall(null); setOutgoingCall(null); });
    return () => socketService.clearCallListeners();
  }, [currentUserId]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length > 2) {
        const results = await userApi.searchUsers(searchQuery);
        setSearchResults(results.filter((u: any) => u.user_id !== currentUserId));
      } else setSearchResults([]);
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const selectUser = async (user: any) => {
    setSelectedUser(user);
    setSearchQuery('');
    setSearchResults([]);
    setActiveChatKey(null);
    setShowThemeMenu(false);
    setShowIdentityCard(false);
    
    let hashedId = user.chat_id;
    if (!hashedId) {
        const sortedIds = [currentUserId, user.user_id].sort();
        const rawChatId = sortedIds.join('_');
        const encoder = new TextEncoder();
        const data = encoder.encode(rawChatId);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        hashedId = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    setChatId(hashedId);
    socketService.joinChat(hashedId);
    setShowPasswordPrompt(true);
    setMessages([]); 
    
    if (user.theme) setCurrentTheme(user.theme);
    else setCurrentTheme('midnight');
  };

  const loadChatHistory = async (id: string, key: CryptoKey) => {
    setLoadingHistory(true);
    try {
      const history = await messageApi.getChatHistory(id);
      const decryptedHistory = await Promise.all(history.map(async (msg: Message) => {
        if (msg.type === 'SYSTEM' && msg.system_action === 'THEME_CHANGE' && msg.theme_name) {
            setCurrentTheme(msg.theme_name);
        }
        if (msg.ciphertext && msg.type !== 'SYSTEM') {
           try {
               const plaintext = await decryptMessage(msg.ciphertext, msg.iv!, msg.auth_tag!, key);
               return { ...msg, plaintext, status: 'sent' as const };
           } catch(e) { return { ...msg, plaintext: "[Decryption Error]" }; }
        }
        return msg;
      }));
      setMessages(decryptedHistory);
    } catch (err) { setMessages([]); } finally { setLoadingHistory(false); }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatId || !chatPassword) return;
    setIsDerivingKey(true);
    try {
      const key = await deriveKey(chatPassword, chatId); 
      setActiveChatKey(key);
      setShowPasswordPrompt(false);
      setChatPassword('');
      loadChatHistory(chatId, key);
    } catch (err) { alert("Key derivation failed"); } finally { setIsDerivingKey(false); }
  };

  useEffect(() => {
    socketService.subscribeToMessages(async (msg: Message) => {
      if (msg.chat_id === chatId) {
        if (msg.type === 'SYSTEM' && msg.system_action === 'THEME_CHANGE' && msg.theme_name) {
            setCurrentTheme(msg.theme_name);
        }
        if (activeChatKey && msg.ciphertext && msg.type !== 'SYSTEM') {
          try {
              const plaintext = await decryptMessage(msg.ciphertext, msg.iv!, msg.auth_tag!, activeChatKey);
              setMessages(prev => [...prev, { ...msg, plaintext, status: 'sent' }]);
          } catch(e) { setMessages(prev => [...prev, msg]); }
        } else {
          setMessages(prev => [...prev, msg]);
        }
      }
      fetchRecent(true);
    });
    return () => socketService.unsubscribeFromMessages();
  }, [chatId, activeChatKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, [currentTheme]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId || !activeChatKey || !selectedUser) return;
    
    const tempMsg: Message = {
        chat_id: chatId,
        sender_id: currentUserId,
        type: 'TEXT',
        plaintext: newMessage,
        timestamp: new Date().toISOString(),
        status: 'sending'
    };
    
    setMessages(prev => [...prev, tempMsg]);
    setNewMessage('');

    try {
      const encrypted = await encryptMessage(newMessage, activeChatKey);
      const payload = { 
          chat_id: chatId, 
          ...encrypted,
          participants: [currentUserId, selectedUser.user_id] 
      };
      socketService.sendMessage(payload);
      setMessages(prev => prev.map(m => m.timestamp === tempMsg.timestamp ? { ...m, status: 'sent' } : m));
      fetchRecent(true);
    } catch (err) { console.error(err); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chatId || !activeChatKey || !selectedUser) return;
    setIsUploading(true);
    try {
      const { ciphertext, iv, auth_tag } = await encryptFile(file, activeChatKey);
      const { url } = await mediaApi.uploadEncryptedFile(ciphertext, file.name);
      const payload = { 
          chat_id: chatId, 
          ciphertext: "MEDIA", 
          iv, auth_tag, 
          is_media: true, 
          media_url: url,
          participants: [currentUserId, selectedUser.user_id]
      };
      socketService.sendMessage(payload);
      setMessages(prev => [...prev, { ...payload, type: 'MEDIA', sender_id: currentUserId, timestamp: new Date().toISOString(), status: 'sent' }]);
      fetchRecent(true);
    } catch (err: any) { 
        console.error("Upload failed", err);
        const errorMsg = err.response?.data?.error || "Media upload failed. Check server Cloudinary configuration.";
        alert(errorMsg); 
    } finally { setIsUploading(false); }
    };

  const changeChatTheme = (t: string) => {
    if (chatId) {
        socketService.sendThemeChange(chatId, t);
        setShowThemeMenu(false);
    }
  };

  const initiateCall = (type: 'video' | 'voice') => {
    if (!selectedUser || !chatId) return;
    setOutgoingCall({ ...selectedUser, type });
  };

  const renderSystemMessage = (msg: Message) => {
    let content = "";
    switch(msg.system_action) {
        case 'THEME_CHANGE': content = `changed the chat theme to ${msg.theme_name}`; break;
        case 'CALL_START': content = `started a secure call`; break;
        case 'CALL_END': content = `ended the call`; break;
        case 'CALL_MISSED': content = `missed a call`; break;
    }
    return (
        <div className="flex justify-center my-4 animate-in fade-in duration-500" key={msg._id || Math.random()}>
            <div className="bg-bg-input/30 backdrop-blur-sm px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-text-muted border border-border-subtle shadow-sm">
                {msg.sender_id === currentUserId ? "You" : "Contact"} {content}
            </div>
        </div>
    );
  };

  return (
    <div className="flex w-full h-full bg-bg-app overflow-hidden relative text-text-main">
      {(incomingCall || outgoingCall) && (
        <CallOverlay 
          incomingCall={incomingCall}
          outgoingCallTo={outgoingCall}
          onClose={() => { setIncomingCall(null); setOutgoingCall(null); }}
          chatId={chatId!}
        />
      )}

      {/* Sidebar */}
      <aside className={`${selectedUser ? 'hidden md:flex' : 'flex'} w-full md:w-85 border-r border-border-subtle flex-col bg-bg-card shrink-0 transition-all duration-300`}>
        <div className="p-6 border-b border-border-subtle">
          <div className="flex items-center justify-between mb-4 px-1">
              <h2 className="text-xl font-black tracking-tighter">Messages</h2>
              {loadingRecent && <div className="w-4 h-4 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />}
          </div>
          <div className="relative group">
              <input 
                type="text" 
                placeholder="Search encrypted network..." 
                className="w-full pl-10 pr-4 py-3 bg-bg-input border border-border-subtle rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 transition-all shadow-inner placeholder:text-text-muted/30" 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                autoComplete="off"
              />
              <svg className="w-4 h-4 absolute left-3.5 top-3.5 text-text-muted/50 group-focus-within:text-brand-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
          {loadingRecent ? <SidebarSkeleton /> : (
              <>
                {searchResults.length > 0 && (
                    <div className="px-3 py-2 text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] mb-1">Results</div>
                )}
                {searchResults.map(user => (
                    <button key={user.user_id} className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl hover:bg-bg-input text-left transition-all group active:scale-[0.98]" onClick={() => selectUser(user)}>
                    <div className="w-12 h-12 rounded-2xl bg-gradient-brand flex items-center justify-center text-white font-bold shadow-lg shadow-brand-primary/20 group-hover:scale-105 transition-transform overflow-hidden">
                        {user.profilePictureUrl ? <img src={user.profilePictureUrl} className="w-full h-full object-cover" alt="" /> : user.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <div className="text-sm font-black truncate">@{user.username}</div>
                        <div className="text-[11px] text-text-muted truncate font-medium">{user.firstName} {user.lastName}</div>
                    </div>
                    </button>
                ))}

                {searchResults.length === 0 && (
                    <>
                        <div className="px-3 py-2 text-[10px] font-black text-text-muted uppercase tracking-[0.2em] mb-1">Recent</div>
                        {recentChats.length === 0 ? (
                            <div className="p-8 text-center text-text-muted text-sm italic opacity-30 font-medium leading-relaxed">Secure link vault empty.<br/>Establish connection to begin.</div>
                        ) : recentChats.map(user => (
                            <button key={user.user_id} className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-all group active:scale-[0.98] ${selectedUser?.user_id === user.user_id ? 'bg-brand-primary/10 border border-brand-primary/20' : 'hover:bg-bg-input'}`} onClick={() => selectUser(user)}>
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black shadow-lg transition-all overflow-hidden ${selectedUser?.user_id === user.user_id ? 'bg-gradient-brand scale-105' : 'bg-bg-input group-hover:bg-brand-primary/20 group-hover:text-brand-primary'}`}>
                                    {user.profilePictureUrl ? <img src={user.profilePictureUrl} className="w-full h-full object-cover" alt="" /> : user.username[0].toUpperCase()}
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <div className="text-sm font-black truncate">@{user.username}</div>
                                    <div className="text-[11px] text-text-muted truncate font-bold uppercase tracking-tighter opacity-60 italic">Decryption Active</div>
                                </div>
                            </button>
                        ))}
                    </>
                )}
              </>
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <section className={`${selectedUser ? 'flex' : 'hidden md:flex'} flex-1 flex flex-col relative bg-bg-app overflow-hidden`}>
        {showPasswordPrompt ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg-app/95 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-sm p-10 bg-bg-card rounded-[3rem] shadow-2xl border border-border-subtle text-center scale-in duration-300 relative">
              <button 
                className="absolute top-6 right-6 text-text-muted hover:text-brand-primary transition-colors p-2"
                onMouseEnter={() => setShowHelpTooltip(true)}
                onMouseLeave={() => setShowHelpTooltip(false)}
                onClick={() => setShowHelpTooltip(!showHelpTooltip)}
                aria-label="How it works"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </button>

              {showHelpTooltip && (
                  <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 p-5 bg-bg-input border border-border-subtle rounded-3xl shadow-2xl text-[11px] text-left text-text-main leading-relaxed animate-in fade-in slide-in-from-bottom-3 z-10 border-brand-primary/20 font-medium">
                      <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-bg-input absolute -bottom-2 left-1/2 -translate-x-1/2"></div>
                      <strong className="text-brand-primary uppercase tracking-widest block mb-1">Peer-to-Peer Protocol</strong>
                      This shared secret is processed locally via PBKDF2 to derive a 256-bit AES key. It is <u>never</u> transmitted or stored on any server.
                  </div>
              )}

              <div className="w-20 h-20 bg-brand-primary/10 rounded-3xl flex items-center justify-center text-brand-primary mx-auto mb-10 shadow-inner text-white">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
              </div>
              <h3 className="text-3xl font-black mb-3 tracking-tighter uppercase italic">Secure Handshake</h3>
              <p className="text-text-muted text-[13px] mb-10 leading-relaxed font-medium">Synchronize local keys with <strong>@{selectedUser?.username}</strong></p>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <input type="password" placeholder="Shared Secret Key" className="w-full px-4 py-5 bg-bg-input border border-border-subtle rounded-[1.5rem] text-center text-xl tracking-[0.5rem] focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all placeholder:tracking-normal placeholder:text-[10px] placeholder:uppercase placeholder:font-black shadow-inner" value={chatPassword} onChange={(e) => setChatPassword(e.target.value)} autoFocus autoComplete="new-password" />
                <button type="submit" disabled={isDerivingKey} className="w-full py-5 bg-gradient-brand text-white font-black rounded-[1.5rem] shadow-xl shadow-brand-primary/30 active:scale-[0.98] transition-all uppercase tracking-[0.2em] text-[10px]">{isDerivingKey ? 'Encrypting...' : 'Initiate Session'}</button>
                <button type="button" className="text-text-muted text-[10px] font-black uppercase tracking-[0.2em] mt-6 hover:text-text-main transition-colors" onClick={() => { setShowPasswordPrompt(false); setSelectedUser(null); }}>Terminate Link</button>
              </form>
            </div>
          </div>
        ) : selectedUser && activeChatKey ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border-subtle bg-bg-card/50 backdrop-blur-xl z-10 shadow-sm">
                <div className="flex items-center gap-4 overflow-hidden">
                    <button onClick={() => {setSelectedUser(null); setActiveChatKey(null);}} className="md:hidden p-2.5 -ml-3 text-text-muted hover:text-text-main transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"/></svg></button>
                    <button onClick={() => setShowIdentityCard(!showIdentityCard)} className="w-11 h-11 rounded-2xl bg-gradient-brand flex items-center justify-center text-white font-black shadow-md shrink-0 text-lg overflow-hidden hover:scale-105 transition-transform">
                        {selectedUser.profilePictureUrl ? <img src={selectedUser.profilePictureUrl} className="w-full h-full object-cover" alt="" /> : selectedUser.username[0].toUpperCase()}
                    </button>
                    <div className="overflow-hidden cursor-pointer group" onClick={() => setShowIdentityCard(!showIdentityCard)}>
                        <div className="text-base font-black truncate leading-tight group-hover:text-brand-primary transition-colors">@{selectedUser.username}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                            <div className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.15em]">Isolated P2P Link</div>
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-1 md:gap-3">
                    <div className="relative">
                        <button onClick={() => setShowThemeMenu(!showThemeMenu)} className={`p-2.5 rounded-xl transition-all ${showThemeMenu ? 'bg-bg-input text-brand-primary shadow-inner ring-1 ring-brand-primary/20' : 'text-text-muted hover:bg-bg-input hover:text-text-main'}`} title="Change Appearance" aria-label="Themes">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>
                        </button>
                        {showThemeMenu && (
                            <div className="absolute right-0 mt-4 w-52 bg-bg-card border border-border-subtle rounded-[1.5rem] shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 ring-1 ring-white/5">
                                {[
                                    {id: 'midnight', color: '#6366f1'},
                                    {id: 'insta', color: '#e1306c'},
                                    {id: 'love', color: '#fb7185'},
                                    {id: 'cyberpunk', color: '#fdf500'},
                                    {id: 'ocean', color: '#0ea5e9'},
                                    {id: 'matrix', color: '#22c55e'},
                                    {id: 'gold', color: '#d4af37'}
                                ].map(t => (
                                    <button key={t.id} onClick={() => changeChatTheme(t.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-xs font-black uppercase tracking-widest transition-all ${currentTheme === t.id ? 'bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/20' : 'hover:bg-bg-input text-text-muted hover:text-text-main'}`}>
                                        <div className="w-3.5 h-3.5 rounded-full shadow-inner border border-white/10" style={{ backgroundColor: t.color }} />
                                        {t.id}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="w-px h-6 bg-border-subtle mx-1 md:mx-2" />

                    <button onClick={() => initiateCall('voice')} className="p-2.5 text-text-muted hover:bg-bg-input hover:text-brand-primary rounded-xl transition-all active:scale-90" aria-label="Voice Call"><svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg></button>
                    <button onClick={() => initiateCall('video')} className="p-2.5 text-text-muted hover:bg-bg-input hover:text-brand-primary rounded-xl transition-all active:scale-90" aria-label="Video Call"><svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg></button>
                </div>
            </div>

            {/* Identity Card Overlay */}
            {showIdentityCard && (
                <div className="absolute top-24 left-6 w-72 p-8 bg-bg-card border border-border-subtle rounded-[2.5rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] z-40 animate-in fade-in slide-in-from-top-4 duration-500 ring-1 ring-white/5">
                    <div className="flex flex-col items-center text-center">
                        <div className="w-24 h-24 rounded-[2rem] bg-gradient-brand flex items-center justify-center text-white text-4xl font-black mb-6 overflow-hidden shadow-2xl">
                            {selectedUser.profilePictureUrl ? <img src={selectedUser.profilePictureUrl} className="w-full h-full object-cover" alt="" /> : selectedUser.username[0].toUpperCase()}
                        </div>
                        <h4 className="text-2xl font-black tracking-tight mb-1">@{selectedUser.username}</h4>
                        <p className="text-text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-6 opacity-50">{selectedUser.firstName} {selectedUser.lastName}</p>
                        
                        <div className="w-full space-y-3">
                            <div className="bg-bg-input/50 p-4 rounded-2xl border border-border-subtle">
                                <span className="block text-[8px] font-black uppercase text-brand-primary mb-1.5 tracking-widest text-left">Protocol Status</span>
                                <p className="text-[11px] text-left leading-relaxed text-text-main font-bold">Verified Zero-Knowledge Peer</p>
                            </div>
                            {selectedUser.bio && (
                                <div className="bg-bg-input/50 p-4 rounded-2xl border border-border-subtle">
                                    <span className="block text-[8px] font-black uppercase text-brand-primary mb-1.5 tracking-widest text-left">Peer Bio</span>
                                    <p className="text-[11px] text-left leading-relaxed text-text-main font-bold italic">"{selectedUser.bio}"</p>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setShowIdentityCard(false)} className="mt-8 text-[9px] font-black uppercase tracking-[0.3em] text-text-muted hover:text-text-main transition-colors">Close Record</button>
                    </div>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar bg-bg-app/30 relative">
              {loadingHistory ? <MessageSkeleton /> : messages.map((msg, idx) => (
                msg.type === 'SYSTEM' ? renderSystemMessage(msg) : (
                <div key={idx} className={`flex flex-col ${msg.sender_id === currentUserId ? 'items-end' : 'items-start'} group animate-in slide-in-from-bottom-2 duration-300`}>
                  <div className={`max-w-[85%] md:max-w-[70%] px-5 py-3.5 rounded-[1.5rem] text-[15px] shadow-sm leading-relaxed relative ${
                      msg.sender_id === currentUserId 
                        ? 'bg-gradient-brand text-white rounded-tr-none shadow-brand-primary/20' 
                        : 'bg-bg-card border border-border-subtle rounded-tl-none shadow-sm font-medium'
                  }`}>
                    {msg.type === 'MEDIA' ? (
                        <EncryptedImage url={msg.media_url!} iv={msg.iv!} authTag={msg.auth_tag!} cryptoKey={activeChatKey} />
                    ) : (
                        <p className="whitespace-pre-wrap">{msg.plaintext}</p>
                    )}
                    
                    <div className="flex items-center gap-1.5 mt-2 opacity-40">
                        <span className="text-[9px] font-black uppercase tracking-wider">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {msg.sender_id === currentUserId && (
                            <div className="flex">
                                <svg className={`w-3 h-3 ${msg.status === 'sent' ? 'text-white' : 'animate-pulse'}`} fill="currentColor" viewBox="0 0 20 20" aria-label={msg.status}>
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                                </svg>
                            </div>
                        )}
                    </div>
                  </div>
                </div>
              )))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-6 border-t border-border-subtle bg-bg-card/50 backdrop-blur-xl">
              <form className="max-w-4xl mx-auto flex items-end gap-3" onSubmit={handleSendMessage}>
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*" aria-label="Upload image" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-4 bg-bg-input rounded-2xl border border-border-subtle text-text-muted hover:text-brand-primary transition-all shadow-sm active:scale-95 group" aria-label="Attach file">
                    {isUploading ? <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" /> : <svg className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg>}
                </button>
                <textarea rows={1} placeholder="Transmit encrypted bits..." className="flex-1 px-6 py-4 bg-bg-input border border-border-subtle rounded-[1.5rem] text-text-main placeholder:text-text-muted/30 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 transition-all resize-none max-h-40 shadow-inner font-bold text-sm md:text-base" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e as any); }}} />
                <button type="submit" disabled={!newMessage.trim()} className="p-4 bg-gradient-brand text-white rounded-2xl shadow-xl shadow-brand-primary/30 active:scale-95 transition-all disabled:grayscale disabled:opacity-20 group" aria-label="Send message">
                    <svg className="w-6 h-6 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-bg-app">
            <div className="w-40 h-40 bg-bg-card rounded-[4rem] border border-border-subtle flex items-center justify-center mb-10 shadow-2xl relative rotate-3 animate-in zoom-in duration-700">
                <div className="absolute inset-0 bg-brand-primary/5 rounded-[4rem] animate-pulse"></div>
                <div className="absolute inset-4 border border-brand-primary/10 rounded-[3rem]"></div>
                <svg className="w-20 h-20 text-brand-primary/40 relative z-10 drop-shadow-2xl" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            </div>
            <h2 className="text-4xl font-black text-text-main mb-4 tracking-tighter italic">Secure Vault</h2>
            <p className="max-w-xs text-text-muted leading-relaxed font-black uppercase text-[10px] tracking-[0.3em] opacity-40">Zero-Knowledge Peer Protocol Active</p>
            <div className="mt-10 flex gap-3">
                <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                <div className="w-2 h-2 bg-brand-primary/20 rounded-full"></div>
                <div className="w-2 h-2 bg-brand-primary/20 rounded-full"></div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default Chat;
