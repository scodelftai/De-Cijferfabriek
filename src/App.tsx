import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { AlertCircle, Clock, CheckCircle2, Users, Briefcase, Landmark, Play, ShieldAlert, Handshake, Info, GraduationCap, BookOpen, Scale, Vote, MessageSquare, Send, Bot, X } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

const socket: Socket = io();

type Role = 'laks' | 'parents' | 'tutors' | 'teachers' | 'minister' | null;
type Status = 'waiting' | 'phase1' | 'phase2' | 'phase3' | 'phase4' | 'phase5' | 'phase6' | 'phase7' | 'finished';

type PricePolicy = "Vrije Markt" | "Maximaal €15 per uur" | "Volledig Verboden";
type Investment = "€0" | "€400 miljoen" | "€800 miljoen";
type AccessPolicy = "Volledige toegang" | "Alleen na 16:00 uur" | "Verboden toegang";

interface Proposal {
  pricePolicy: PricePolicy;
  investment: Investment;
  accessPolicy: AccessPolicy;
}

interface ChatMessage {
  id: string;
  senderRole: string;
  targetRole: string | 'all';
  text: string;
  timestamp: number;
}

interface RoomData {
  status: Status;
  laksId: string;
  parentsId: string;
  tutorsId: string;
  teachersId: string;
  ministerId: string;
  laksProposal: Proposal | null;
  parentsProposal: Proposal | null;
  tutorsProposal: Proposal | null;
  teachersProposal: Proposal | null;
  ministerProposal: Proposal | null;
  currentAgreement: Proposal | null;
  logs: string[];
  activePowerTools: Record<string, boolean>;
  votes: Record<string, 'voor' | 'tegen'>;
  lawRejected?: boolean;
  chatMessages: ChatMessage[];
}

const PRICE_OPTIONS: PricePolicy[] = ["Vrije Markt", "Maximaal €15 per uur", "Volledig Verboden"];
const INVESTMENT_OPTIONS: Investment[] = ["€0", "€400 miljoen", "€800 miljoen"];
const ACCESS_OPTIONS: AccessPolicy[] = ["Volledige toegang", "Alleen na 16:00 uur", "Verboden toegang"];

const playSound = (type: 'action' | 'vote' | 'success' | 'fail' | 'message') => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'action') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'vote') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'message') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    }
  } catch (e) {
    // Ignore audio errors
  }
};

const calculateScore = (role: Role, proposal: Proposal | null) => {
  if (!proposal || !role) return 0;
  let score = 0;
  const agr = proposal;

  if (role === 'laks') {
    if (agr.pricePolicy === 'Maximaal €15 per uur') score += 50;
    else if (agr.pricePolicy === 'Volledig Verboden') score += 25;
    if (agr.investment === '€800 miljoen') score += 50;
    else if (agr.investment === '€400 miljoen') score += 25;
    if (agr.accessPolicy === 'Verboden toegang') score += 50;
    else if (agr.accessPolicy === 'Alleen na 16:00 uur') score += 25;
  } else if (role === 'parents') {
    if (agr.pricePolicy === 'Volledig Verboden') score += 50;
    else if (agr.pricePolicy === 'Maximaal €15 per uur') score += 25;
    if (agr.investment === '€800 miljoen') score += 50;
    else if (agr.investment === '€400 miljoen') score += 25;
    if (agr.accessPolicy === 'Verboden toegang') score += 50;
    else if (agr.accessPolicy === 'Alleen na 16:00 uur') score += 25;
  } else if (role === 'tutors') {
    if (agr.pricePolicy === 'Vrije Markt') score += 50;
    else if (agr.pricePolicy === 'Maximaal €15 per uur') score += 25;
    if (agr.investment === '€0') score += 50;
    else if (agr.investment === '€400 miljoen') score += 25;
    if (agr.accessPolicy === 'Volledige toegang') score += 50;
    else if (agr.accessPolicy === 'Alleen na 16:00 uur') score += 25;
  } else if (role === 'teachers') {
    if (agr.pricePolicy === 'Volledig Verboden') score += 50;
    else if (agr.pricePolicy === 'Maximaal €15 per uur') score += 25;
    if (agr.investment === '€800 miljoen') score += 50;
    else if (agr.investment === '€400 miljoen') score += 25;
    if (agr.accessPolicy === 'Verboden toegang') score += 50;
    else if (agr.accessPolicy === 'Alleen na 16:00 uur') score += 25;
  } else if (role === 'minister') {
    if (agr.pricePolicy === 'Maximaal €15 per uur') score += 50;
    else if (agr.pricePolicy === 'Volledig Verboden') score += 25;
    if (agr.investment === '€400 miljoen') score += 50;
    else if (agr.investment === '€800 miljoen') score += 25;
    if (agr.accessPolicy === 'Alleen na 16:00 uur') score += 50;
    else if (agr.accessPolicy === 'Verboden toegang') score += 25;
  }
  return score;
};

const calculatePowerToolEffects = (role: Role, activePowerTools: Record<string, boolean>) => {
  if (!role || !activePowerTools) return 0;
  let score = 0;
  
  if (activePowerTools['tiktok']) {
    if (role === 'laks') score -= 10;
    if (role === 'tutors') score -= 15;
  }
  if (activePowerTools['staking']) {
    if (role === 'laks') score -= 15;
    if (role === 'minister') score -= 20;
    if (role === 'teachers') score -= 20;
  }
  if (activePowerTools['rechtszaak']) {
    if (role === 'minister') score -= 15;
    if (role === 'parents') score -= 0;
  }
  if (activePowerTools['lobby']) {
    if (role === 'tutors') score -= 10;
    if (role === 'laks') score -= 15;
  }
  if (activePowerTools['faillissement']) {
    if (role === 'tutors') score -= 20;
    if (role === 'minister') score -= 20;
  }
  if (activePowerTools['nakijkstaking']) {
    if (role === 'teachers') score -= 10;
    if (role === 'minister') score -= 15;
  }
  if (activePowerTools['blokkade']) {
    if (role === 'teachers') score -= 15;
    if (role === 'tutors') score -= 20;
  }
  
  return score;
};

export const roleNames: Record<string, string> = {
  laks: 'LAKS', parents: 'Oudervereniging', tutors: 'Bijlesinstituten', teachers: 'Docentenbond', minister: 'Minister van Onderwijs'
};

function ChatBox({ roomId, roomData, myRole }: { roomId: string, roomData: RoomData, myRole: Role }) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<string | 'all'>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [roomData.chatMessages, isOpen]);

  useEffect(() => {
    if (roomData.chatMessages && roomData.chatMessages.length > 0) {
      const lastMsg = roomData.chatMessages[roomData.chatMessages.length - 1];
      if (lastMsg.senderRole !== myRole && (lastMsg.targetRole === 'all' || lastMsg.targetRole === myRole)) {
        playSound('message');
        if (!isOpen) {
          toast(`Nieuw bericht van ${roleNames[lastMsg.senderRole] || 'Systeem'}`, {
            description: lastMsg.text,
            action: { label: 'Open Chat', onClick: () => setIsOpen(true) }
          });
        }
      }
    }
  }, [roomData.chatMessages]);

  if (!myRole) return null;

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    
    const newMsg: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      senderRole: myRole,
      targetRole: target,
      text: message.trim(),
      timestamp: Date.now()
    };
    
    socket.emit('send_message', { roomId, message: newMsg });
    setMessage('');
  };

  const visibleMessages = (roomData.chatMessages || []).filter(msg => 
    msg.targetRole === 'all' || msg.targetRole === myRole || msg.senderRole === myRole
  );

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-transform hover:scale-105 z-50 flex items-center gap-2"
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-24 right-6 w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col z-50 overflow-hidden"
            style={{ height: '500px', maxHeight: '80vh' }}
          >
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2"><MessageSquare className="w-5 h-5" /> Achterkamertjes</h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {visibleMessages.length === 0 ? (
                <p className="text-center text-slate-500 text-sm mt-4">Nog geen berichten. Start de onderhandeling!</p>
              ) : (
                visibleMessages.map(msg => {
                  const isMe = msg.senderRole === myRole;
                  const isPrivate = msg.targetRole !== 'all';
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className="text-[10px] text-slate-500 mb-1 px-1">
                        {isMe ? 'Jij' : roleNames[msg.senderRole]} 
                        {isPrivate && (isMe ? ` fluistert naar ${roleNames[msg.targetRole]}` : ` fluistert naar jou`)}
                      </div>
                      <div className={`px-3 py-2 rounded-2xl max-w-[85%] text-sm ${isMe ? 'bg-blue-600 text-white rounded-tr-sm' : isPrivate ? 'bg-purple-100 text-purple-900 border border-purple-200 rounded-tl-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'}`}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="p-3 bg-white border-t border-slate-200">
              <div className="mb-2">
                <select 
                  value={target} 
                  onChange={(e) => setTarget(e.target.value)}
                  className="w-full text-xs border-slate-200 rounded p-1.5 bg-slate-50 text-slate-700"
                >
                  <option value="all">Aan iedereen (Publiek)</option>
                  {Object.entries(roleNames).map(([key, name]) => (
                    key !== myRole && <option key={key} value={key}>Fluister naar {name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Typ een bericht..." 
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button type="submit" disabled={!message.trim()} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [myRole, setMyRole] = useState<Role>(null);
  const [joinCode, setJoinCode] = useState('');
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    const storedId = sessionStorage.getItem('userId');
    if (storedId) {
      setUserId(storedId);
    } else {
      const newId = Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('userId', newId);
      setUserId(newId);
    }
  }, []);

  useEffect(() => {
    socket.on('room_update', (data: RoomData) => {
      setRoomData(data);
      if (data.laksId === userId) setMyRole('laks');
      else if (data.parentsId === userId) setMyRole('parents');
      else if (data.tutorsId === userId) setMyRole('tutors');
      else if (data.teachersId === userId) setMyRole('teachers');
      else if (data.ministerId === userId) setMyRole('minister');
      else setMyRole(null);
    });
    return () => { socket.off('room_update'); };
  }, [userId]);

  const createRoom = () => {
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.emit('join_room', newRoomId);
    setRoomId(newRoomId);
  };

  const joinRoom = (code: string) => {
    if (!code) return;
    const upperCode = code.toUpperCase();
    socket.emit('join_room', upperCode);
    setRoomId(upperCode);
  };

  const selectRole = (role: Role) => {
    if (!roomId || !roomData) return;
    const updates: any = {};
    if (roomData.laksId === userId) updates.laksId = '';
    if (roomData.parentsId === userId) updates.parentsId = '';
    if (roomData.tutorsId === userId) updates.tutorsId = '';
    if (roomData.teachersId === userId) updates.teachersId = '';
    if (roomData.ministerId === userId) updates.ministerId = '';

    if (role === 'laks') updates.laksId = userId;
    if (role === 'parents') updates.parentsId = userId;
    if (role === 'tutors') updates.tutorsId = userId;
    if (role === 'teachers') updates.teachersId = userId;
    if (role === 'minister') updates.ministerId = userId;
    
    updates.logs = [`Speler is ${role} geworden.`];
    socket.emit('update_room', { roomId, updates });
  };

  const startGame = () => {
    if (!roomId || !roomData) return;
    socket.emit('update_room', {
      roomId,
      updates: { status: 'phase1', logs: ['Fase 1: Het Schandaal is begonnen!'] }
    });
  };

  if (!roomId || !roomData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <Toaster position="bottom-left" />
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-8">De Cijfer-Fabriek</h1>
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-2">Nieuwe sessie</h2>
              <button onClick={createRoom} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl">Maak nieuwe kamer</button>
            </div>
            <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div><div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-slate-500">OF</span></div></div>
            <div>
              <h2 className="text-lg font-semibold mb-2">Bestaande sessie</h2>
              <div className="flex gap-2">
                <input type="text" placeholder="Kamercode" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} className="flex-1 border border-slate-300 rounded-xl px-4 py-3 uppercase" maxLength={6} />
                <button onClick={() => joinRoom(joinCode)} className="bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 px-6 rounded-xl">Doe mee</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (roomData.status === 'waiting') {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <Toaster position="bottom-left" />
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 mb-8 text-center">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">De Cijfer-Fabriek</h1>
            <p className="text-slate-500 mb-6">Kies je rol voor deze simulatie</p>
            <div className="inline-block bg-slate-100 rounded-lg px-6 py-3 mb-8">
              <span className="text-sm text-slate-500 uppercase font-bold tracking-wider mr-3">Kamercode:</span>
              <span className="text-2xl font-mono font-bold text-slate-900 tracking-widest">{roomId}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <RoleCard title="LAKS" icon={<Users />} description="Vertegenwoordigt de leerlingen." isTaken={!!roomData.laksId} isMe={myRole === 'laks'} onSelect={() => selectRole('laks')} color="bg-blue-50 text-blue-700" />
            <RoleCard title="Oudervereniging" icon={<Users />} description="Ouders met minder economisch kapitaal." isTaken={!!roomData.parentsId} isMe={myRole === 'parents'} onSelect={() => selectRole('parents')} color="bg-emerald-50 text-emerald-700" />
            <RoleCard title="Bijlesinstituten" icon={<Briefcase />} description="De commerciële sector." isTaken={!!roomData.tutorsId} isMe={myRole === 'tutors'} onSelect={() => selectRole('tutors')} color="bg-amber-50 text-amber-700" />
            <RoleCard title="Docentenbond" icon={<BookOpen />} description="Leraren en schoolleiders." isTaken={!!roomData.teachersId} isMe={myRole === 'teachers'} onSelect={() => selectRole('teachers')} color="bg-purple-50 text-purple-700" />
            <RoleCard title="Minister van Onderwijs" icon={<Landmark />} description="De Regering." isTaken={!!roomData.ministerId} isMe={myRole === 'minister'} onSelect={() => selectRole('minister')} color="bg-red-50 text-red-700" />
          </div>
          <div className="flex justify-center">
            <button onClick={startGame} disabled={!roomData.laksId || !roomData.parentsId || !roomData.tutorsId || !roomData.teachersId || !roomData.ministerId} className="bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 px-12 rounded-xl text-lg flex items-center gap-2">
              <Play className="w-6 h-6" /> Start Simulatie
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster position="bottom-left" />
      <GameDashboard roomId={roomId} roomData={roomData} myRole={myRole} userId={userId} />
      <ChatBox roomId={roomId} roomData={roomData} myRole={myRole} />
    </>
  );
}

function RoleCard({ title, icon, description, isTaken, isMe, onSelect, color }: any) {
  return (
    <button onClick={onSelect} disabled={isTaken && !isMe} className={`relative p-6 rounded-2xl border-2 text-left transition-all ${isMe ? 'ring-4 ring-offset-2 ring-blue-500 ' + color : isTaken ? 'bg-slate-100 border-slate-200 opacity-50 cursor-not-allowed' : color}`}>
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-sm opacity-80">{description}</p>
      {isTaken && !isMe && <div className="absolute top-4 right-4 text-xs font-bold uppercase bg-slate-200 text-slate-600 px-2 py-1 rounded">Bezet</div>}
      {isMe && <div className="absolute top-4 right-4 text-xs font-bold uppercase bg-blue-500 text-white px-2 py-1 rounded">Jouw Rol</div>}
    </button>
  );
}

function GameDashboard({ roomId, roomData, myRole, userId }: { roomId: string, roomData: RoomData, myRole: Role, userId: string }) {
  const PHASES: Status[] = ['waiting', 'phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6', 'phase7', 'finished'];

  const prevPhase = () => {
    const currentIndex = PHASES.indexOf(roomData.status);
    if (currentIndex > 1) {
      socket.emit('update_room', { roomId, updates: { status: PHASES[currentIndex - 1] } });
    }
  };

  const nextPhase = () => {
    const currentIndex = PHASES.indexOf(roomData.status);
    if (currentIndex < PHASES.length - 1) {
      socket.emit('update_room', { roomId, updates: { status: PHASES[currentIndex + 1] } });
    }
  };

  const getScore = (role: Role) => {
    if (!role) return 0;
    let base = 0; // Base score is now 0, we calculate entirely from state
    if (roomData.status === 'finished') {
      // In finished state, we might want to keep the final calculated score
      // but for now let's re-calculate it to be safe
      base = roomData.lawRejected && role === 'minister' ? -50 : 0;
    }
    
    let proposalScore = 0;
    if (roomData.status === 'phase6' || roomData.status === 'phase7' || roomData.status === 'finished') {
      proposalScore = calculateScore(role, roomData.currentAgreement);
    } else {
      proposalScore = calculateScore(role, roomData[`${role}Proposal` as keyof RoomData] as Proposal | null);
    }

    const powerToolScore = calculatePowerToolEffects(role, roomData.activePowerTools);
    
    return base + proposalScore + powerToolScore;
  };

  const roleNames = {
    laks: 'LAKS', parents: 'Oudervereniging', tutors: 'Bijlesinstituten', teachers: 'Docentenbond', minister: 'Minister van Onderwijs'
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-slate-900 text-white p-4 shadow-md flex justify-between items-center z-10">
        <div className="flex items-center gap-4">
          <GraduationCap className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="font-bold text-xl leading-tight">De Cijfer-Fabriek</h1>
            <div className="text-xs text-slate-400">Kamer: {roomId} | Status: {roomData.status.toUpperCase()}</div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {myRole === 'minister' && roomData.status !== 'waiting' && roomData.status !== 'finished' && (
            <div className="flex gap-2">
              <button onClick={prevPhase} className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold py-2 px-4 rounded-lg">Vorige Fase</button>
              <button onClick={nextPhase} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-2 px-4 rounded-lg">Volgende Fase</button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Jouw Rol</h2>
            <div className="text-2xl font-bold text-slate-800">{myRole ? roleNames[myRole] : 'Toeschouwer'}</div>
            <div className="mt-2 text-sm font-bold text-blue-600">Jouw Punten: {getScore(myRole)}</div>
          </div>
          <div className="p-6 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Landmark className="w-4 h-4" /> Tussenstand</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center"><span className="text-slate-600">LAKS</span><span className="font-bold text-slate-800">{getScore('laks')}</span></div>
              <div className="flex justify-between items-center"><span className="text-slate-600">Ouders</span><span className="font-bold text-slate-800">{getScore('parents')}</span></div>
              <div className="flex justify-between items-center"><span className="text-slate-600">Bijles</span><span className="font-bold text-slate-800">{getScore('tutors')}</span></div>
              <div className="flex justify-between items-center"><span className="text-slate-600">Docenten</span><span className="font-bold text-slate-800">{getScore('teachers')}</span></div>
              <div className="flex justify-between items-center"><span className="text-slate-600">Minister</span><span className="font-bold text-slate-800">{getScore('minister')}</span></div>
            </div>
          </div>
          {myRole && (
            <div className="p-6 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><Info className="w-4 h-4" /> Jouw Puntenverdeling</h3>
              <ul className="text-xs text-slate-600 space-y-3">
                {myRole === 'laks' && (
                  <>
                    <li><strong>Prijs:</strong> Max €15 (50pt), Verboden (25pt), Vrij (0pt)</li>
                    <li><strong>Investering:</strong> €800M (50pt), €400M (25pt), €0 (0pt)</li>
                    <li><strong>Toegang:</strong> Verboden (50pt), Na 16:00 (25pt), Volledig (0pt)</li>
                  </>
                )}
                {myRole === 'parents' && (
                  <>
                    <li><strong>Prijs:</strong> Verboden (50pt), Max €15 (25pt), Vrij (0pt)</li>
                    <li><strong>Investering:</strong> €800M (50pt), €400M (25pt), €0 (0pt)</li>
                    <li><strong>Toegang:</strong> Verboden (50pt), Na 16:00 (25pt), Volledig (0pt)</li>
                  </>
                )}
                {myRole === 'tutors' && (
                  <>
                    <li><strong>Prijs:</strong> Vrij (50pt), Max €15 (25pt), Verboden (0pt)</li>
                    <li><strong>Investering:</strong> €0 (50pt), €400M (25pt), €800M (0pt)</li>
                    <li><strong>Toegang:</strong> Volledig (50pt), Na 16:00 (25pt), Verboden (0pt)</li>
                  </>
                )}
                {myRole === 'teachers' && (
                  <>
                    <li><strong>Prijs:</strong> Verboden (50pt), Max €15 (25pt), Vrij (0pt)</li>
                    <li><strong>Investering:</strong> €800M (50pt), €400M (25pt), €0 (0pt)</li>
                    <li><strong>Toegang:</strong> Verboden (50pt), Na 16:00 (25pt), Volledig (0pt)</li>
                  </>
                )}
                {myRole === 'minister' && (
                  <>
                    <li><strong>Prijs:</strong> Max €15 (50pt), Verboden (25pt), Vrij (0pt)</li>
                    <li><strong>Investering:</strong> €400M (50pt), €800M (25pt), €0 (0pt)</li>
                    <li><strong>Toegang:</strong> Na 16:00 (50pt), Verboden (25pt), Volledig (0pt)</li>
                    <li className="text-red-600 font-bold mt-2">Let op: Als de wet wordt afgewezen, krijg je -50pt!</li>
                  </>
                )}
              </ul>
            </div>
          )}
          <div className="p-6 flex-1">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Machtsmiddelen</h3>
            <ActionButtons roomId={roomId} roomData={roomData} myRole={myRole} />
          </div>
        </div>

        <div className="flex-1 p-4 md:p-8 overflow-y-auto relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={roomData.status}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full"
            >
              {roomData.status === 'phase1' && <Phase1 roomId={roomId} myRole={myRole} />}
              {(roomData.status === 'phase2' || roomData.status === 'phase4') && <ProposalPhase roomId={roomId} roomData={roomData} myRole={myRole} phase={roomData.status} />}
              {(roomData.status === 'phase3' || roomData.status === 'phase5') && <ArenaPhase roomId={roomId} roomData={roomData} myRole={myRole} />}
              {roomData.status === 'phase6' && <DecisionPhase roomId={roomId} roomData={roomData} myRole={myRole} />}
              {(roomData.status === 'phase7' || roomData.status === 'finished') && <VotingPhase roomId={roomId} roomData={roomData} myRole={myRole} />}
            </motion.div>
          </AnimatePresence>
        </div>

        <GuidanceSidebar roomData={roomData} myRole={myRole} />
      </div>
    </div>
  );
}

function Phase1({ roomId, myRole }: { roomId: string, myRole: Role }) {
  const startPhase2 = () => {
    socket.emit('update_room', { roomId, updates: { status: 'phase2', logs: ['Fase 2: Posities innemen'] } });
  };
  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-red-200 p-8">
      <h2 className="text-3xl font-bold text-red-600 mb-6 flex items-center gap-3"><AlertCircle className="w-10 h-10" /> BREAKING NEWS</h2>
      <p className="text-lg text-slate-800 mb-8 font-medium italic border-l-4 border-red-500 pl-4">"Onderwijsinspectie luidt noodklok: Kinderen met veel economisch kapitaal kopen VWO-diploma's via dure examentrainingen. De sociale ongelijkheid in de klas is onhoudbaar."</p>
      {myRole === 'minister' && <button onClick={startPhase2} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl">Start Onderhandelingen</button>}
    </div>
  );
}

function ProposalPhase({ roomId, roomData, myRole, phase }: { roomId: string, roomData: RoomData, myRole: Role, phase: string }) {
  const currentProp = myRole ? roomData[`${myRole}Proposal` as keyof RoomData] as Proposal | null : null;
  const [pricePolicy, setPricePolicy] = useState<PricePolicy>(currentProp?.pricePolicy || "Vrije Markt");
  const [investment, setInvestment] = useState<Investment>(currentProp?.investment || "€0");
  const [accessPolicy, setAccessPolicy] = useState<AccessPolicy>(currentProp?.accessPolicy || "Volledige toegang");

  useEffect(() => {
    if (!myRole) return;
    const proposal: Proposal = { pricePolicy, investment, accessPolicy };
    const updates: any = {};
    updates[`${myRole}Proposal`] = proposal;
    socket.emit('update_room', { roomId, updates });
  }, [pricePolicy, investment, accessPolicy, myRole, roomId]);

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">{phase === 'phase2' ? 'Fase 2: Posities innemen' : 'Fase 4: De Herijking'}</h2>
      <div className="space-y-6">
        <div>
          <label className="block font-bold text-slate-700 mb-2">Prijsbeleid Particuliere Bijles</label>
          <select value={pricePolicy} onChange={e => setPricePolicy(e.target.value as PricePolicy)} className="w-full border p-3 rounded-lg">
            {PRICE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block font-bold text-slate-700 mb-2">Overheidsinvestering in scholen</label>
          <select value={investment} onChange={e => setInvestment(e.target.value as Investment)} className="w-full border p-3 rounded-lg">
            {INVESTMENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block font-bold text-slate-700 mb-2">Toegang tot schoolgebouwen</label>
          <select value={accessPolicy} onChange={e => setAccessPolicy(e.target.value as AccessPolicy)} className="w-full border p-3 rounded-lg">
            {ACCESS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="text-center p-4 bg-blue-50 rounded-xl text-blue-800">
          <p>Je keuzes worden direct opgeslagen en je punten updaten realtime.</p>
        </div>
      </div>
    </div>
  );
}

function ArenaPhase({ roomId, roomData, myRole }: { roomId: string, roomData: RoomData, myRole: Role }) {
  const [spindoctorAdvice, setSpindoctorAdvice] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  const askSpindoctor = async () => {
    setIsAsking(true);
    try {
      const apiKey = (window as any).ENV?.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      const ai = new GoogleGenAI({ apiKey: apiKey });
      const prompt = `Je bent een keiharde, strategische politieke spindoctor in een rollenspel over onderwijsbeleid. 
      Mijn rol is: ${roleNames[myRole as string]}.
      Huidige voorstellen van iedereen:
      LAKS: ${JSON.stringify(roomData.laksProposal)}
      Ouders: ${JSON.stringify(roomData.parentsProposal)}
      Bijles: ${JSON.stringify(roomData.tutorsProposal)}
      Docenten: ${JSON.stringify(roomData.teachersProposal)}
      Minister: ${JSON.stringify(roomData.ministerProposal)}
      
      Geef in maximaal 3 korte zinnen strategisch advies. Met wie moet ik een bondje sluiten? Wie is mijn grootste vijand nu? Wat moet ik toegeven? Wees scherp en cynisch.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt
      });
      setSpindoctorAdvice(response.text || "Geen advies beschikbaar.");
    } catch (e) {
      setSpindoctorAdvice("De spindoctor is momenteel onbereikbaar.");
    }
    setIsAsking(false);
  };

  const radarData = ['laks', 'parents', 'tutors', 'teachers', 'minister'].map(role => {
    const minProp = roomData.ministerProposal || { pricePolicy: "Vrije Markt", investment: "€0", accessPolicy: "Volledige toegang" };
    return {
      subject: roleNames[role],
      A: calculateScore(role as Role, minProp),
      fullMark: 150,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">De Arena: Onderhandelen!</h2>
        <button 
          onClick={askSpindoctor} 
          disabled={isAsking}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"
        >
          <Bot className="w-4 h-4" /> {isAsking ? 'Spindoctor denkt na...' : 'Vraag de Spindoctor'}
        </button>
      </div>

      <AnimatePresence>
        {spindoctorAdvice && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-purple-900 text-sm italic relative"
          >
            <button onClick={() => setSpindoctorAdvice(null)} className="absolute top-2 right-2 text-purple-400 hover:text-purple-700"><X className="w-4 h-4" /></button>
            <strong>Spindoctor zegt:</strong> {spindoctorAdvice}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-64 flex flex-col items-center justify-center">
        <h3 className="text-sm font-bold text-slate-500 uppercase mb-2">Tevredenheid met huidig voorstel Minister</h3>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12 }} />
            <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
            <Radar name="Tevredenheid" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.5} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['laks', 'parents', 'tutors', 'teachers', 'minister'].map(role => {
          const prop = (roomData[`${role}Proposal` as keyof RoomData] as Proposal | null) || {
            pricePolicy: "Vrije Markt",
            investment: "€0",
            accessPolicy: "Volledige toegang"
          };
          const potentialScore = calculateScore(myRole, prop);
          const isMe = role === myRole;
          
          return (
            <div key={role} className={`bg-white p-4 rounded-xl shadow-sm border ${isMe ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'} relative`}>
              <h3 className="font-bold text-lg mb-3">{roleNames[role]} {isMe && '(Jouw Voorstel)'}</h3>
              
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Prijsbeleid</label>
                  <p className="text-sm font-medium">{prop.pricePolicy}</p>
                </div>
                
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Investering</label>
                  <p className="text-sm font-medium">{prop.investment}</p>
                </div>
                
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Toegang</label>
                  <p className="text-sm font-medium">{prop.accessPolicy}</p>
                </div>
              </div>

              {myRole && !isMe && (
                <div className="absolute top-4 right-4 bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">
                  Jouw score: +{potentialScore}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DecisionPhase({ roomId, roomData, myRole }: { roomId: string, roomData: RoomData, myRole: Role }) {
  const currentProp = roomData.currentAgreement;
  const [pricePolicy, setPricePolicy] = useState<PricePolicy>(currentProp?.pricePolicy || "Vrije Markt");
  const [investment, setInvestment] = useState<Investment>(currentProp?.investment || "€0");
  const [accessPolicy, setAccessPolicy] = useState<AccessPolicy>(currentProp?.accessPolicy || "Volledige toegang");

  useEffect(() => {
    if (myRole !== 'minister') return;
    socket.emit('update_room', {
      roomId,
      updates: {
        currentAgreement: { pricePolicy, investment, accessPolicy }
      }
    });
  }, [pricePolicy, investment, accessPolicy, myRole, roomId]);

  if (myRole !== 'minister') {
    return <div className="text-center p-8 bg-amber-50 rounded-xl text-amber-800"><Clock className="w-12 h-12 mx-auto mb-4" /><p>De Minister stelt de definitieve wet op...</p></div>;
  }

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Fase 6: De Onderwijswet</h2>
      <div className="space-y-6">
        <div>
          <label className="block font-bold text-slate-700 mb-2">Prijsbeleid</label>
          <select value={pricePolicy} onChange={e => setPricePolicy(e.target.value as PricePolicy)} className="w-full border p-3 rounded-lg">
            {PRICE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block font-bold text-slate-700 mb-2">Investering</label>
          <select value={investment} onChange={e => setInvestment(e.target.value as Investment)} className="w-full border p-3 rounded-lg">
            {INVESTMENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block font-bold text-slate-700 mb-2">Toegang</label>
          <select value={accessPolicy} onChange={e => setAccessPolicy(e.target.value as AccessPolicy)} className="w-full border p-3 rounded-lg">
            {ACCESS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="text-center p-4 bg-blue-50 rounded-xl text-blue-800">
          <p>Je keuzes worden direct opgeslagen als de definitieve wet. Klik op 'Volgende Fase' rechtsboven als je klaar bent.</p>
        </div>
      </div>
    </div>
  );
}

function VotingPhase({ roomId, roomData, myRole }: { roomId: string, roomData: RoomData, myRole: Role }) {
  const [headline, setHeadline] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const vote = (choice: 'voor' | 'tegen') => {
    if (!myRole || myRole === 'minister') return;
    const updates: any = { votes: { ...roomData.votes, [myRole]: choice } };
    updates.logs = [`${myRole} heeft gestemd.`];
    socket.emit('update_room', { roomId, updates });
  };

  const finishGame = () => {
    const votes = Object.values(roomData.votes);
    const voor = votes.filter(v => v === 'voor').length;
    const passed = voor >= 3;
    
    const updates: any = { 
      status: 'finished', 
      logs: [`De wet is ${passed ? 'AANGENOMEN' : 'AFGEWEZEN'} (${voor} voor).`],
      lawRejected: !passed
    };
    
    socket.emit('update_room', { roomId, updates });
  };

  const generateHeadline = async () => {
    setIsGenerating(true);
    try {
      const apiKey = (window as any).ENV?.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      const ai = new GoogleGenAI({ apiKey: apiKey });
      const passed = !roomData.lawRejected;
      const prompt = `Schrijf een sensationele, realistische krantenkop (max 15 woorden) voor de voorpagina van een Nederlandse krant over de nieuwe onderwijswet.
      De wet is ${passed ? 'AANGENOMEN' : 'AFGEWEZEN'}.
      Inhoud wet:
      Prijsbeleid: ${roomData.currentAgreement?.pricePolicy}
      Investering: ${roomData.currentAgreement?.investment}
      Toegang: ${roomData.currentAgreement?.accessPolicy}
      Geef alleen de krantenkop, geen verdere tekst.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt
      });
      setHeadline(response.text || "Nieuwe Onderwijswet Zorgt Voor Ophef");
    } catch (e) {
      setHeadline("Nieuwe Onderwijswet Zorgt Voor Ophef (AI onbereikbaar)");
    }
    setIsGenerating(false);
  };

  useEffect(() => {
    if (roomData.status === 'finished' && !headline && !isGenerating) {
      generateHeadline();
    }
  }, [roomData.status]);

  if (roomData.status === 'finished') {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        {headline && (
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-zinc-900 text-white p-8 rounded-2xl shadow-2xl text-center font-serif border-4 border-zinc-800"
          >
            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-tight">
              {headline.replace(/["*]/g, '')}
            </h1>
            <p className="text-zinc-400 mt-4 font-sans text-sm uppercase tracking-widest">De Telegraaf - Morgen Editie</p>
          </motion.div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <h2 className="text-3xl font-bold mb-6 text-slate-800">Einduitslag</h2>
          <div className="space-y-4 text-lg font-bold text-slate-600">
            <div className="flex justify-between p-3 bg-slate-50 rounded-lg">
              <span>LAKS</span>
              <span className="text-blue-600">{calculateScore('laks', roomData.currentAgreement) + calculatePowerToolEffects('laks', roomData.activePowerTools)} pt</span>
            </div>
            <div className="flex justify-between p-3 bg-slate-50 rounded-lg">
              <span>Oudervereniging</span>
              <span className="text-blue-600">{calculateScore('parents', roomData.currentAgreement) + calculatePowerToolEffects('parents', roomData.activePowerTools)} pt</span>
            </div>
            <div className="flex justify-between p-3 bg-slate-50 rounded-lg">
              <span>Bijlesinstituten</span>
              <span className="text-blue-600">{calculateScore('tutors', roomData.currentAgreement) + calculatePowerToolEffects('tutors', roomData.activePowerTools)} pt</span>
            </div>
            <div className="flex justify-between p-3 bg-slate-50 rounded-lg">
              <span>Docentenbond</span>
              <span className="text-blue-600">{calculateScore('teachers', roomData.currentAgreement) + calculatePowerToolEffects('teachers', roomData.activePowerTools)} pt</span>
            </div>
            <div className="flex justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
              <span className="text-blue-900">Minister van Onderwijs</span>
              <span className="text-blue-700">{calculateScore('minister', roomData.currentAgreement) + calculatePowerToolEffects('minister', roomData.activePowerTools) + (roomData.lawRejected ? -50 : 0)} pt</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hasVoted = myRole && roomData.votes[myRole];
  const allVoted = Object.keys(roomData.votes).length === 4;

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
      <h2 className="text-2xl font-bold mb-6">Stemming Onderwijswet</h2>
      <div className="bg-slate-50 p-4 rounded-lg mb-6 text-left">
        <p><strong>Prijs:</strong> {roomData.currentAgreement?.pricePolicy}</p>
        <p><strong>Investering:</strong> {roomData.currentAgreement?.investment}</p>
        <p><strong>Toegang:</strong> {roomData.currentAgreement?.accessPolicy}</p>
      </div>
      
      {myRole === 'minister' ? (
        <div>
          <p>Wachten op de stemmen... ({Object.keys(roomData.votes).length}/4)</p>
          {allVoted && <button onClick={finishGame} className="mt-4 bg-blue-600 text-white font-bold py-2 px-6 rounded-lg">Bereken Uitslag</button>}
        </div>
      ) : hasVoted ? (
        <p>Je hebt gestemd. Wachten op anderen...</p>
      ) : (
        <div className="flex gap-4 justify-center">
          <button onClick={() => vote('voor')} className="bg-green-600 text-white font-bold py-3 px-8 rounded-xl">VOOR</button>
          <button onClick={() => vote('tegen')} className="bg-red-600 text-white font-bold py-3 px-8 rounded-xl">TEGEN</button>
        </div>
      )}
    </div>
  );
}

function ActionButtons({ roomId, roomData, myRole }: any) {
  const isPhase3or5 = roomData.status === 'phase3' || roomData.status === 'phase5';
  
  const toggleAction = (actionId: string, actionName: string) => {
    const isActive = roomData.activePowerTools[actionId];
    const newActiveState = { ...roomData.activePowerTools, [actionId]: !isActive };
    const logs = [`${actionName} is nu ${!isActive ? 'AAN' : 'UIT'} gezet.`];
    
    socket.emit('update_room', { 
      roomId, 
      updates: { 
        activePowerTools: newActiveState,
        logs 
      } 
    });
  };

  if (!isPhase3or5) return <p className="text-sm text-slate-500">Acties zijn nu niet beschikbaar.</p>;

  const renderButton = (id: string, name: string, description: string, costText: string) => {
    const isActive = roomData.activePowerTools[id];
    return (
      <button 
        onClick={() => toggleAction(id, name)} 
        className={`w-full text-left p-3 rounded-lg border transition-colors ${isActive ? 'bg-indigo-100 border-indigo-400 ring-2 ring-indigo-200' : 'bg-slate-50 hover:bg-slate-100 border-slate-200'}`}
      >
        <div className="flex justify-between items-center mb-1">
          <div className="font-bold text-sm text-slate-800">{name}</div>
          <div className={`text-xs font-bold px-2 py-0.5 rounded ${isActive ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
            {isActive ? 'AAN' : 'UIT'}
          </div>
        </div>
        <div className="text-xs text-slate-600 mb-1">{description}</div>
        <div className="text-xs font-bold text-red-600">{costText}</div>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {myRole === 'laks' && (
        <>
          {renderButton('tiktok', 'TikTok-campagne', 'Start een viral campagne tegen de bijlesindustrie.', 'LAKS -10pt, Bijles -15pt')}
          {renderButton('staking', 'Scholierenstaking', 'Roep alle leerlingen op om te staken.', 'LAKS -15pt, Minister -20pt, Docenten -20pt')}
        </>
      )}
      {myRole === 'parents' && (
        <>
          {renderButton('rechtszaak', 'Rechtszaak', 'Span een rechtszaak aan tegen de staat wegens kansenongelijkheid.', 'Minister -15pt, Ouders -0pt')}
        </>
      )}
      {myRole === 'tutors' && (
        <>
          {renderButton('lobby', 'Lobbycampagne', 'Zet lobbyisten in om de politiek te beïnvloeden.', 'Bijles -10pt, LAKS -15pt')}
          {renderButton('faillissement', 'Dreigen met faillissement', 'Dreig ermee dat duizenden banen verloren gaan.', 'Bijles -20pt, Minister -20pt')}
        </>
      )}
      {myRole === 'teachers' && (
        <>
          {renderButton('nakijkstaking', 'Nakijk-staking', 'Weiger nog langer toetsen na te kijken.', 'Docenten -10pt, Minister -15pt')}
          {renderButton('blokkade', 'Samenwerking blokkeren', 'Weiger commerciële bureaus in de school.', 'Docenten -15pt, Bijles -20pt')}
        </>
      )}
    </div>
  );
}

function GuidanceSidebar({ roomData, myRole }: { roomData: RoomData, myRole: Role }) {
  const phaseExplanations: Record<string, string> = {
    waiting: "Wachten tot alle rollen (5 spelers) bezet zijn. Zodra iedereen er is, kan de simulatie gestart worden.",
    phase1: "Fase 1: Het Schandaal. Lees het nieuwsbericht goed door. Dit is de aanleiding voor de onderhandelingen.",
    phase2: "Fase 2: Posities innemen. Bepaal in het geheim wat voor jouw rol de ideale uitkomst is voor de 3 variabelen (Prijsbeleid, Investering, Toegang).",
    phase3: "Fase 3: De Arena (Eerste Onderhandeling). Ga in gesprek met de andere partijen! Probeer bondjes te sluiten en gebruik je machtsmiddelen (actieknoppen) om druk te zetten.",
    phase4: "Fase 4: De Herijking. Even pauze. Evalueer je strategie en vul een nieuw compromis-voorstel in op basis van de eerste onderhandelingen.",
    phase5: "Fase 5: De Eindstrijd. De laatste kans om te onderhandelen! Zet je laatste machtsmiddelen in en probeer de Minister te overtuigen van jouw standpunten.",
    phase6: "Fase 6: De Onderwijswet. De tijd is om. De Minister hakt nu de knopen door en stelt de definitieve wet op.",
    phase7: "Fase 7: De Stemming. Iedereen (behalve de Minister) stemt VOOR of TEGEN de wet. Bij een meerderheid (3/4) is de wet aangenomen.",
    finished: "Het spel is afgelopen! Bekijk de einduitslag en bespreek met elkaar hoe de onderhandelingen zijn gegaan."
  };

  const currentExplanation = phaseExplanations[roomData.status] || "";

  return (
    <div className="w-full md:w-80 bg-white border-l border-slate-200 flex flex-col h-full">
      <div className="p-4 border-b border-slate-100 bg-blue-50">
        <h3 className="font-bold text-blue-900 flex items-center gap-2 mb-2">
          <Info className="w-5 h-5" /> Spelverloop & Uitleg
        </h3>
        <p className="text-sm text-blue-800 leading-relaxed">
          {currentExplanation}
        </p>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 font-bold text-slate-800 flex items-center gap-2">
          <Bot className="w-5 h-5 text-purple-600" /> Spelleider (Chatbot)
        </div>
        <Chatbot />
      </div>
    </div>
  );
}

function Chatbot() {
  const [messages, setMessages] = useState<{role: 'user'|'model', text: string}[]>([
    { role: 'model', text: 'Hallo! Ik ben de Spelleider. Heb je vragen over de regels, je rol, of wat je nu moet doen? Vraag het gerust!' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apiKey = (window as any).ENV?.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const ai = new GoogleGenAI({ apiKey: apiKey });
    chatRef.current = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: "Je bent de 'Spelleider', een behulpzame chatbot voor de educatieve simulatie 'De Cijfer-Fabriek'. Je helpt leerlingen met vragen over het spelverloop, de regels, en hun rol. Het spel gaat over kansengelijkheid in het onderwijs. Er zijn 5 rollen: LAKS, Oudervereniging, Bijlesinstituten, Docentenbond, Minister van Onderwijs. Er zijn 7 fases: 1. Schandaal, 2. Posities innemen, 3. Eerste onderhandeling, 4. Herijking, 5. Tweede onderhandeling, 6. Beslissing Minister, 7. Stemming. Geef korte, duidelijke en aanmoedigende antwoorden. Gebruik geen ingewikkelde opmaak."
      }
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);
    
    try {
      const responseStream = await chatRef.current.sendMessageStream({ message: userMsg });
      setMessages(prev => [...prev, { role: 'model', text: '' }]);
      
      for await (const chunk of responseStream) {
        setMessages(prev => {
          const newMsgs = [...prev];
          newMsgs[newMsgs.length - 1].text += chunk.text;
          return newMsgs;
        });
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'model', text: 'Sorry, er ging iets mis bij het ophalen van het antwoord. Probeer het nog eens.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-100 text-slate-800 rounded-bl-none'}`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 text-slate-500 rounded-2xl rounded-bl-none px-4 py-2 text-sm flex items-center gap-2">
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={sendMessage} className="p-3 border-t border-slate-100 flex gap-2 bg-slate-50">
        <input 
          type="text" 
          value={input} 
          onChange={e => setInput(e.target.value)} 
          placeholder="Vraag de Spelleider..." 
          className="flex-1 border border-slate-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <button 
          type="submit" 
          disabled={!input.trim() || isLoading}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white rounded-full p-2 flex items-center justify-center transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

export default App;