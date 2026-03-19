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
  const [debugStatus, setDebugStatus] = useState('Initializing P2P...');
  
  const pc = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const isComponentMounted = useRef(true);
  const candidateQueue = useRef<RTCIceCandidateInit[]>([]);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const targetId = incomingCall?.from || outgoingCallTo?.user_id;
  const isVideo = incomingCall?.type === 'video' || outgoingCallTo?.type === 'video';

  useEffect(() => {
    isComponentMounted.current = true;
    setupPeerConnection();
    
    if (incomingCall) {
        setCallState('RINGING');
    } else if (outgoingCallTo) {
        setCallState('OFFERING');
        startCall();
    }

    socketService.onIceCandidate(({ candidate }) => {
        if (pc.current?.remoteDescription) {
            pc.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error("ICE Error", e));
        } else {
            // Bulletproof: Queue candidates if remote description isn't ready
            candidateQueue.current.push(candidate);
        }
    });

    socketService.onCallEnded(() => terminateCall());
    socketService.onCallRejected(() => terminateCall());

    return () => {
      isComponentMounted.current = false;
      cleanup();
    };
  }, []);

  const processQueuedCandidates = () => {
      console.log("[RTC] Processing queued candidates:", candidateQueue.current.length);
      while (candidateQueue.current.length > 0) {
          const candidate = candidateQueue.current.shift();
          if (candidate && pc.current) {
              pc.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error(e));
          }
      }
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
    cleanup();
    setTimeout(() => { if (isComponentMounted.current) onClose(); }, 1500);
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
        setDebugStatus(`Network: ${state}`);
        if (state === 'connected' || state === 'completed') setCallState('CONNECTED');
        if (state === 'failed') setDebugStatus('Blocked by Firewall (TURN required)');
    };

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
                await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
                processQueuedCandidates();
            }
        });
    } catch (err) { onClose(); }
  };

  const acceptCall = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
        if (!isComponentMounted.current) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        stream.getTracks().forEach(track => pc.current?.addTrack(track, stream));

        await pc.current!.setRemoteDescription(new RTCSessionDescription(incomingCall!.offer));
        processQueuedCandidates();
        const answer = await pc.current!.createAnswer();
        await pc.current!.setLocalDescription(answer);
        socketService.sendCallAnswer(targetId!, answer);
    } catch (err) { onClose(); }
  };

  const hangup = () => {
    if (targetId) socketService.sendHangup(targetId, chatId);
    terminateCall();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4 animate-in fade-in duration-500">
      <div className="w-full max-w-4xl flex flex-col items-center">
        <div className="relative w-full aspect-video bg-zinc-900 rounded-[3rem] overflow-hidden border border-white/5 shadow-2xl group">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          
          {/* Status Indicators */}
          <div className="absolute top-8 left-8 z-20 flex flex-col gap-2">
              <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 rounded-2xl">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Secure Link</span>
              </div>
              <div className="px-3 py-1 bg-black/40 rounded-lg text-[8px] font-bold text-zinc-500 uppercase tracking-tighter w-fit">
                  {debugStatus}
              </div>
          </div>

          <div className="absolute bottom-8 right-8 w-32 md:w-64 aspect-video bg-black rounded-[2rem] overflow-hidden border-2 border-brand-primary/30 shadow-2xl z-10">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>

          {(callState === 'RINGING' || callState === 'OFFERING') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-app/80 backdrop-blur-xl">
              <div className="relative mb-10">
                <div className="absolute inset-0 bg-brand-primary rounded-full animate-ping opacity-10"></div>
                <div className="relative w-32 h-28 bg-gradient-brand rounded-[3rem] flex items-center justify-center text-white text-5xl font-black shadow-2xl">
                    {targetId?.[0].toUpperCase()}
                </div>
              </div>
              <h2 className="text-3xl font-black text-text-main mb-2 tracking-tighter italic">
                {callState === 'RINGING' ? 'Encrypted Incoming' : 'Establishing Secure Link...'}
              </h2>
            </div>
          )}

          {callState === 'ENDED' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-2xl">
                <h2 className="text-2xl font-black text-white uppercase tracking-widest italic">Handshake Terminated</h2>
            </div>
          )}
        </div>

        <div className="mt-12 flex gap-8 p-8 bg-white/5 backdrop-blur-3xl rounded-[3rem] border border-white/10 shadow-2xl">
          {callState === 'RINGING' ? (
            <>
              <button onClick={acceptCall} className="w-20 h-20 bg-emerald-500 hover:bg-emerald-400 text-white rounded-[2.5rem] flex items-center justify-center shadow-lg transition-all active:scale-90"><svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg></button>
              <button onClick={() => terminateCall()} className="w-20 h-20 bg-red-500 hover:bg-red-400 text-white rounded-[2.5rem] flex items-center justify-center shadow-lg transition-all active:scale-90"><svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </>
          ) : (
            <button onClick={hangup} className="w-20 h-20 bg-red-500 hover:bg-red-400 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 rotate-[135deg]">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallOverlay;
