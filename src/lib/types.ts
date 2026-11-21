export type Mood = 'calm' | 'curious' | 'excited' | 'irritated';
export type Node = 'hello' | 'topic' | 'invite' | 'draw' | 'reaction' | 'disagreement' | 'warning' | 'paused' | 'naming' | 'saved' | 'company';
export type Mark = 'heavy' | 'light' | 'circle' | 'free';
export interface Artist {
  id: string; name: string; fullName: string; english: string; years: string;
  tag: string; medium: string; color: string; image: string; object: string;
  bio: string; personality: string; greeting: string; observation: string;
  rule: string; firstMark: string; heavy: string; light: string; circle: string;
  disagreement: string; quiet: string; goal: string;
  rate: number; pitch: number; voiceURI?: string; custom?: boolean;
  referenceImage?: string; sourceNotes?: string; identityType?: 'fictional' | 'historical';
  voiceEngine?: 'device' | 'service';
  serviceVoice?: { provider: 'minimax' | 'volcengine' | 'aliyun' | 'sensetime' | 'sensetimev5'; model: string; voice: string };
}
export type ArtistVoiceSettings = Pick<Artist, 'voiceURI' | 'rate' | 'pitch' | 'voiceEngine' | 'serviceVoice'>;
export interface Message { id: string; who: 'artist' | 'player'; text: string; action?: string }
export interface Memory { id: string; kind: string; text: string; night: number; workId?: string }
export interface PaintingMemory {
  id: string; paintingId: string; speakerId: string; question: string;
  explanation: string; createdAt: string; night: number;
}
export interface PersonState {
  node: Node; mood: Mood; interest: number; irritation: number; evidence: string[];
  messages: Message[]; memories: Memory[]; lastResult?: string; mark?: Mark;
  workId?: string; draftPaths: string[]; lastCustomText?: string; declined?: boolean;
}
export interface Work {
  id: string; artistId: string; title: string; mark: Mark; paths: string[];
  createdAt: string; night: number; shared: boolean; disagreement: boolean;
}
export interface GroupMessage { id: string; who: 'player' | 'artist'; artistId?: string; text: string }
export interface GroupChat { id: string; name: string; memberIds: string[]; messages: GroupMessage[] }
export interface Save {
  version: 1; night: number; scene: 'dusk' | 'rain'; invited: string[];
  customArtists: Artist[]; people: Record<string, PersonState>; works: Work[];
  voiceSettings: Record<string, ArtistVoiceSettings>;
  groupChats?: GroupChat[];
  paintingMemories?: PaintingMemory[];
  muted: boolean; activeId: string | null; ended: boolean;
}
export interface Choice { id: string; text: string; hint?: string; icon?: 'art' | 'quiet' | 'talk' }
