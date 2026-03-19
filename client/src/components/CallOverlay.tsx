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
  
  const pc = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const isComponentMounted = useRef(true);
  const audioCtx = useRef<AudioContext | null>(null);
  const oscillator = useRef<OscillatorNode | null>(null);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const targetId = incomingCall?.from || outgoingCallTo?.user_id;
  const isVideo = incomingCall?.type === 'video' || outgoingCallTo?.type === 'video';

  useEffect(() => {
    isComponentMounted.current = true;
    
    if (incomingCall) {
        setCallState('RINGING');
        playRingtone();
    } else if (outgoingCallTo) {
        setCallState('OFFERING');
        playRingtone();
        startCall();
    }

    socketService.onIceCandidate(({ candidate }) => {
        if (pc.current && pc.current.remoteDescription) {
            pc.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
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
        
        const interval = setInterval(() => {
            if (!oscillator.current || !audioCtx.current) {
                clearInterval(interval);
                return;
            }
            gainNode.gain.setValueAtTime(0.1, audioCtx.current.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.current.currentTime + 1.5);
        }, 2000);
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
        localStreamRef.current.getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
        });
        localStreamRef.current = null;
    }
    if (pc.current) {
        pc.current.close();
        pc.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  const terminateCall = () => {
    setCallState('ENDED');
    stopRingtone();
    cleanup();
    setTimeout(() => {
        if (isComponentMounted.current) onClose();
    }, 1500);
  };

  const setupPeerConnection = () => {
    const config = { 
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.relay.metered.ca:80' }
      ] 
    };
    pc.current = new RTCPeerConnection(config);

    pc.current.onicecandidate = (event) => {
      if (event.candidate && targetId) {
        socketService.sendIceCandidate(targetId, event.candidate);
      }
    };

    pc.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };
  };

  const startCall = async () => {
    try {
        setupPeerConnection();
        const stream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
        if (!isComponentMounted.current) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        stream.getTracks().forEach(track => pc.current?.addTrack(track, stream));

        const offer = await pc.current!.createOffer();
        await pc.current!.setLocalDescription(offer);
        socketService.sendCallRequest(targetId!, offer, outgoingCallTo!.type, chatId);

        socketService.onCallAnswered(async ({ answer }) => {
            if (pc.current) {
                stopRingtone();
                await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
                setCallState('CONNECTED');
            }
        });
    } catch (err) { onClose(); }
  };

  const acceptCall = async () => {
    stopRingtone();
    try {
        setupPeerConnection();
        const stream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
        if (!isComponentMounted.current) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        stream.getTracks().forEach(track => pc.current?.addTrack(track, stream));

        await pc.current!.setRemoteDescription(new RTCSessionDescription(incomingCall!.offer));
        const answer = await pc.current!.createAnswer();
        await pc.current!.setLocalDescription(answer);
        socketService.sendCallAnswer(targetId!, answer);
        setCallState('CONNECTED');
    } catch (err) { onClose(); }
  };

  const hangup = () => {
    if (targetId) socketService.sendHangup(targetId, chatId);
    terminateCall();
  };

  const reject = () => {
    if (targetId) socketService.sendCallReject(targetId, chatId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4 animate-in fade-in duration-500">
      <div className="w-full max-w-4xl flex flex-col items-center">
        
        <div className="relative w-full aspect-video bg-zinc-900 rounded-[3rem] overflow-hidden border border-white/5 shadow-2xl group">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          
          <div className="absolute bottom-8 left-8 z-20 flex items-center gap-2 px-4 py-2 bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 rounded-2xl">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Secure DTLS-SRTP</span>
          </div>

          <div className="absolute bottom-8 right-8 w-32 md:w-64 aspect-video bg-black rounded-[2rem] overflow-hidden border-2 border-brand-primary/30 shadow-2xl z-10 transition-transform group-hover:scale-105 duration-500">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>

          {(callState === 'RINGING' || callState === 'OFFERING') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-app/80 backdrop-blur-xl transition-all">
              <div className="relative mb-10">
                <div className="absolute inset-0 bg-brand-primary rounded-full animate-ping opacity-10"></div>
                <div className="relative w-32 h-28 bg-gradient-brand rounded-[3rem] flex items-center justify-center text-white text-5xl font-black shadow-2xl">
                    {targetId?.[0].toUpperCase()}
                </div>
              </div>
              <h2 className="text-3xl font-black text-text-main mb-2 tracking-tighter italic">
                {callState === 'RINGING' ? 'Encrypted Incoming' : 'Establishing Secure Link...'}
              </h2>
              <p className="text-text-muted text-xs font-black uppercase tracking-[0.3em] opacity-50">Zero-Knowledge Call</p>
            </div>
          )}

          {callState === 'ENDED' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-2xl animate-in fade-in zoom-in duration-300">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-6 border border-red-500/20">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                </div>
                <h2 className="text-2xl font-black text-white uppercase tracking-widest">Handshake Terminated</h2>
            </div>
          )}
        </div>

        <div className="mt-12 flex gap-8 p-8 bg-white/5 backdrop-blur-3xl rounded-[3rem] border border-white/10 shadow-2xl">
          {callState === 'RINGING' ? (
            <>
              <button onClick={acceptCall} className="w-20 h-20 bg-emerald-500 hover:bg-emerald-400 text-white rounded-[2.5rem] flex items-center justify-center shadow-lg shadow-emerald-500/30 transition-all hover:scale-110 active:scale-90 group">
                <svg className="w-10 h-10 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
              </button>
              <button onClick={reject} className="w-20 h-20 bg-red-500 hover:bg-red-400 text-white rounded-[2.5rem] flex items-center justify-center shadow-lg shadow-red-500/30 transition-all hover:scale-110 active:scale-90 group">
                <svg className="w-10 h-10 group-hover:-rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </>
          ) : (
            <button onClick={hangup} className="w-20 h-20 bg-red-500 hover:bg-red-400 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-500/40 transition-all hover:scale-110 active:scale-90 group rotate-[135deg]">
              <svg className="w-10 h-10 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallOverlay;
