// Open Brain Telegram - Conversation Session Store
// Tracks active Q&A sessions per chat so follow-up questions work.
// Sessions expire after TTL_MS of inactivity and are capped at MAX_TURNS.

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TURNS = 10;

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

interface Session {
  history: ConversationTurn[];
  lastActivity: number;
}

export class SessionStore {
  private sessions = new Map<number, Session>();

  isActive(chatId: number): boolean {
    const session = this.sessions.get(chatId);
    if (!session) return false;
    if (Date.now() - session.lastActivity > TTL_MS) {
      this.sessions.delete(chatId);
      return false;
    }
    return true;
  }

  getHistory(chatId: number): ConversationTurn[] {
    return this.sessions.get(chatId)?.history ?? [];
  }

  addTurn(chatId: number, role: "user" | "assistant", content: string): void {
    let session = this.sessions.get(chatId);
    if (!session) {
      session = { history: [], lastActivity: Date.now() };
      this.sessions.set(chatId, session);
    }
    session.history.push({ role, content });
    session.lastActivity = Date.now();
    // Keep only the last MAX_TURNS entries
    if (session.history.length > MAX_TURNS * 2) {
      session.history = session.history.slice(-MAX_TURNS * 2);
    }
  }

  clear(chatId: number): void {
    this.sessions.delete(chatId);
  }

  pruneExpired(): void {
    const now = Date.now();
    for (const [chatId, session] of this.sessions) {
      if (now - session.lastActivity > TTL_MS) {
        this.sessions.delete(chatId);
      }
    }
  }
}
