import React, { useEffect, useRef, useState } from 'react';
import * as socketService from '../services/socket';

interface CallOverlayProps {
  onClose: () => void;
  incomingCall?: { from: string; offer: any; type: 'video' | 'voice'; chat_id: string } | null;
  outgoingCallTo?: { user_id: string; username: string; type: 'video' | 'voice' } | null;
  chatId: string;
}

const CallOverlay: React.FC<CallOverlayProps> = ({ onClose, incomingCall, outgoingCallTo, chatId }) => {
  const [callState, setCallState] = useState<'RINGING' | 'OFFERING' | 'CONNECTED' | 'ENDED'>('RINGING');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  
  const pc = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const isComponentMounted = useRef(true);
  const candidateQueue = useRef<RTCIceCandidateInit[]>([]);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const oscillator = useRef<OscillatorNode | null>(null);

  const targetId = incomingCall?.from || outgoingCallTo?.user_id;
  const isVideo = incomingCall?.type === 'video' || outgoingCallTo?.type === 'video';

  useEffect(() => {
    isComponentMounted.current = true;
    setupPeerConnection();
    
    if (incomingCall) {
        setCallState('RINGING');
        playRingtone();
    } else if (outgoingCallTo) {
        setCallState('OFFERING');
        playRingtone();
        startCall();
    }

    socketService.onIceCandidate(({ candidate }) => {
        if (pc.current?.remoteDescription) {
            pc.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error("ICE Error", e));
        } else {
            candidateQueue.current.push(candidate);
        }
    });

    socketService.onCallEnded(() => terminateCall());
    socketService.onCallRejected(() => terminateCall());

    return () => {
      isComponentMounted.current = false;
      stopRingtone();
      cleanup();
    };
  }, []);

  const processQueuedCandidates = () => {
      while (candidateQueue.current.length > 0) {
          const candidate = candidateQueue.current.shift();
          if (candidate && pc.current) {
              pc.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error(e));
          }
      }
  };

  const playRingtone = () => {
    try {
        audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        oscillator.current = audioCtx.current.createOscillator();
        const gainNode = audioCtx.current.createGain();
        oscillator.current.type = 'sine';
        oscillator.current.frequency.setValueAtTime(440, audioCtx.current.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.current.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.current.currentTime + 1.5);
        oscillator.current.connect(gainNode);
        gainNode.connect(audioCtx.current.destination);
        oscillator.current.start();
    } catch (e) { console.error("Audio failed", e); }
  };

  const stopRingtone = () => {
    oscillator.current?.stop();
    audioCtx.current?.close();
    oscillator.current = null;
    audioCtx.current = null;
  };

  const cleanup = () => {
    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => { track.stop(); track.enabled = false; });
        localStreamRef.current = null;
    }
    if (pc.current) {
        pc.current.close();
        pc.current = null;
    }
  };

  const terminateCall = () => {
    setCallState('ENDED');
    stopRingtone();
    cleanup();
    setTimeout(() => { if (isComponentMounted.current) onClose(); }, 1500);
  };

  const toggleSpeaker = () => {
      // Logic for mobile speaker switching
      setIsSpeakerOn(!isSpeakerOn);
      if (remoteVideoRef.current) {
          // Some mobile browsers allow volume boost to force main speaker
          (remoteVideoRef.current as any).volume = !isSpeakerOn ? 1.0 : 0.5;
      }
  };

  const setupPeerConnection = () => {
    const config = { 
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.relay.metered.ca:80' },
        {
          urls: "turn:global.relay.metered.ca:80",
          username: "6e9911592c54218ca163f3e1",
          credential: "o67tAfx1wGSFL5C8",
        },
        {
          urls: "turn:global.relay.metered.ca:80?transport=tcp",
          username: "6e9911592c54218ca163f3e1",
          credential: "o67tAfx1wGSFL5C8",
        },
        {
          urls: "turn:global.relay.metered.ca:443",
          username: "6e9911592c54218ca163f3e1",
          credential: "o67tAfx1wGSFL5C8",
        },
        {
          urls: "turns:global.relay.metered.ca:443?transport=tcp",
          username: "6e9911592c54218ca163f3e1",
          credential: "o67tAfx1wGSFL5C8",
        },
      ] 
    };
    pc.current = new RTCPeerConnection(config);

    pc.current.oniceconnectionstatechange = () => {
        const state = pc.current?.iceConnectionState;
        if (state === 'connected' || state === 'completed') setCallState('CONNECTED');
    };

    pc.current.onicecandidate = (event) => {
      if (event.candidate && targetId) {
        socketService.sendIceCandidate(targetId, event.candidate);
      }
    };

    pc.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        remoteVideoRef.current.play().catch(e => console.error("Auto-play failed:", e));
      }
    };
  };

  const startCall = async () => {
    try {
        const constraints = { 
            video: isVideo ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false, 
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!isComponentMounted.current) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        stream.getTracks().forEach(track => pc.current?.addTrack(track, stream));

        const offer = await pc.current!.createOffer();
        await pc.current!.setLocalDescription(offer);
        socketService.sendCallRequest(targetId!, offer, outgoingCallTo!.type, chatId);

        socketService.onCallAnswered(async ({ answer }) => {
            if (pc.current) {
                await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
                processQueuedCandidates();
            }
        });
    } catch (err) { console.error(err); onClose(); }
  };

  const acceptCall = async () => {
    stopRingtone();
    try {
        const constraints = { 
            video: isVideo ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false, 
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!isComponentMounted.current) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        stream.getTracks().forEach(track => pc.current?.addTrack(track, stream));

        await pc.current!.setRemoteDescription(new RTCSessionDescription(incomingCall!.offer));
        processQueuedCandidates();
        const answer = await pc.current!.createAnswer();
        await pc.current!.setLocalDescription(answer);
        socketService.sendCallAnswer(targetId!, answer);
    } catch (err) { console.error(err); onClose(); }
  };

  const hangup = () => {
    if (targetId) socketService.sendHangup(targetId, chatId);
    terminateCall();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black overflow-hidden animate-in fade-in duration-500">
      
      {/* Background container - Keeps PC layout centered and contained */}
      <div className="relative w-full h-full md:max-w-5xl md:h-[80vh] md:rounded-[3rem] md:border md:border-white/10 md:shadow-2xl overflow-hidden bg-zinc-950 flex items-center justify-center">
        
        {/* Remote Video Feed */}
        <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className={`w-full h-full object-cover transition-opacity duration-1000 ${callState === 'CONNECTED' ? 'opacity-100' : 'opacity-0'}`} 
        />

        {/* Local Preview - Corrected for PC and Mobile */}
        <div className={`absolute z-20 overflow-hidden border-2 border-brand-primary/30 shadow-2xl transition-all duration-500
            ${callState === 'CONNECTED' 
                ? 'top-6 right-6 w-28 md:w-48 rounded-2xl md:rounded-3xl' 
                : 'bottom-32 left-1/2 -translate-x-1/2 w-48 md:w-64 rounded-3xl'
            } ${!isVideo ? 'hidden' : ''}`}
        >
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover bg-black" />
        </div>

        {/* Voice-Only Placeholder */}
        {!isVideo && callState === 'CONNECTED' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 animate-in fade-in duration-700 px-6 text-center">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-brand flex items-center justify-center text-white text-5xl md:text-6xl font-black shadow-[0_0_60px_rgba(99,102,241,0.4)] mb-8 animate-pulse">
                    {targetId?.[0].toUpperCase()}
                </div>
                <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-3 px-6 py-2 bg-white/5 rounded-full border border-white/10">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                        <span className="text-xs md:text-sm font-black uppercase tracking-[0.2em] text-zinc-400">Secure Voice Link</span>
                    </div>
                    {/* Speaker Toggle UI for Mobile */}
                    <button onClick={toggleSpeaker} className="flex md:hidden items-center gap-2 px-4 py-2 bg-white/5 rounded-xl text-[10px] font-black uppercase text-text-muted hover:text-white">
                        {isSpeakerOn ? 'Speaker: On' : 'Speaker: Off'}
                    </button>
                </div>
            </div>
        )}

        {/* Call Progress Overlays */}
        {(callState === 'RINGING' || callState === 'OFFERING') && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xl transition-all">
            <div className="relative mb-12 text-white">
              <div className="absolute inset-0 bg-brand-primary rounded-full animate-ping opacity-20"></div>
              <div className="relative w-32 h-28 md:w-36 md:h-32 bg-gradient-brand rounded-[3rem] flex items-center justify-center text-5xl md:text-6xl font-black shadow-2xl">
                  {targetId?.[0].toUpperCase()}
              </div>
            </div>
            <h2 className="text-3xl font-black text-white mb-3 tracking-tighter italic px-6 text-center">
              {callState === 'RINGING' ? 'Encrypted Incoming...' : 'Establishing Link...'}
            </h2>
            <p className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.4em] opacity-60">Zero-Knowledge Peer</p>
          </div>
        )}

        {/* Bottom Floating Controls */}
        <div className={`absolute bottom-10 left-1/2 -translate-x-1/2 z-40 transition-all duration-700
            ${callState === 'CONNECTED' ? 'opacity-100 translate-y-0' : 'opacity-100 translate-y-4'}`}
        >
          <div className="flex items-center gap-6 p-6 md:p-7 bg-black/40 backdrop-blur-3xl rounded-[3rem] border border-white/10 shadow-2xl">
            {callState === 'RINGING' ? (
              <>
                <button onClick={acceptCall} className="w-16 h-16 md:w-18 md:h-18 bg-emerald-500 hover:bg-emerald-400 text-white rounded-[2rem] flex items-center justify-center shadow-lg shadow-emerald-500/30 transition-all hover:scale-110 active:scale-90 group">
                  <svg className="w-8 h-8 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                </button>
                <button onClick={() => terminateCall()} className="w-16 h-16 md:w-18 md:h-18 bg-red-500 hover:bg-red-400 text-white rounded-[2rem] flex items-center justify-center shadow-lg shadow-red-500/30 transition-all hover:scale-110 active:scale-90 group">
                  <svg className="w-8 h-8 group-hover:-rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </>
            ) : (
              <>
                <button onClick={hangup} className="w-16 h-16 md:w-18 md:h-18 bg-red-500 hover:bg-red-400 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 rotate-[135deg]">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                </button>
                {/* Speaker Toggle Button */}
                <button onClick={toggleSpeaker} className="md:hidden w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white">
                    {isSpeakerOn ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
                    ) : (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
                    )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status Badge */}
        <div className="absolute top-6 left-6 md:top-10 md:left-10 z-30 pointer-events-none">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Vault Active</span>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default CallOverlay;
