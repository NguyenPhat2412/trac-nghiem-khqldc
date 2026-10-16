export type Actor = {
  id: string;
  name: string;
  role: "GUEST" | "EDITOR" | "ADMIN";
  csrf: string;
};
export type Chapter = {
  id: string;
  title: string;
  description: string;
  position: number;
  status?: string;
  count?: number;
};
export type Question = {
  id: string;
  chapterId: string;
  text: string;
  options: string[];
  correct?: number;
  explanation?: string;
  imageUrl: string;
  difficulty?: string;
  status?: string;
};
export type Quiz = {
  id: string;
  title: string;
  description: string;
  version: number;
  count: number;
  timeLimitSeconds: number;
  questionSeconds: number;
  status: string;
  chapterIds: string[];
  questions?: Question[];
  shuffle?: boolean;
};
export type Catalog = { chapters: Chapter[]; quizzes: Quiz[] };
export type Attempt = {
  id: string;
  title: string;
  quizId: string;
  status: string;
  startedAt: number;
  deadline: number;
  serverTime: number;
  answers: Record<string, number>;
  flagged: string[];
  questions: Question[];
  durationMs: number;
  correct: number;
  score: number;
  ranked: boolean;
  instantFeedback: boolean;
};
export type Rank = {
  rank: number;
  playerId: string;
  name: string;
  shortId: string;
  correct: number;
  score: number;
  durationMs: number;
  attempts?: number;
};
export type History = {
  id: string;
  title: string;
  status: string;
  score: number;
  startedAt: number;
  durationMs: number;
  correct: number;
  count: number;
};
export type Detail = {
  playerId: string;
  name: string;
  questions: { question: Question; answer: number; durationMs: number }[];
};
export type Room = {
  id: string;
  title: string;
  status: string;
  host: boolean;
  untimed?: boolean;
  advanceWhenReady?: boolean;
  personalReplay?: boolean;
  replayAvailable?: boolean;
  replayRoomId?: string;
  replayReason?: string;
  version: number;
  serverTime: number;
  deadline: number;
  locked: boolean;
  early: boolean;
  current: number;
  count: number;
  members: { id: string; name: string; shortId: string }[];
  ranking: Rank[];
  question?: Question;
  myAnswer: number;
  myReady?: boolean;
  readyPlayers?: string[];
  answered: number;
  distribution?: number[];
  details?: Detail[];
  shuffleAnswers: boolean;
  openedAt: number;
  integrity?: { playerId: string; name: string; signals: IntegritySignals }[];
};
export type IntegritySignals = {
  tabHidden: number;
  copyBlocked: number;
  fullscreenExit: number;
  capped: boolean;
};
export type Staff = {
  id: string;
  username: string;
  name: string;
  role: string;
  enabled: boolean;
};
export type RoomSummary = {
  id: string;
  title: string;
  status: string;
  players: number;
  createdAt: number;
};
export type Report = {
  rows: (Rank & {
    title: string;
    mode: string;
    date: number;
    roomId: string;
    integrity?: IntegritySignals;
  })[];
  total: number;
  players: number;
  average: number;
  questions: {
    id: string;
    text: string;
    count: number;
    wrong: number;
    averageMs: number;
  }[];
  chapters: { title: string; count: number }[];
};
