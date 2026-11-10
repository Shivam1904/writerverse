import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore } from './useChatStore';

// SA-296: an error mid-turn (e.g. the server refused the AI call) (text already streamed, then `error`, then
// `done`) must stay visible on that reply instead of looking like a normal one.

const msg = (id: string) => useChatStore.getState().messages.find((m) => m.id === id)!;

beforeEach(() => useChatStore.setState({ messages: [], isStreaming: false }));

describe('chat store error handling', () => {
  it('text streamed, then error, then done → reply keeps its text AND the error', () => {
    const s = useChatStore.getState();
    const id = s.startAssistant();
    s.appendToken(id, 'Here is part of an answer');
    s.fail(id, "The AI call was refused.");
    s.complete(id);

    const m = msg(id);
    expect(m.status).toBe('error');
    expect(m.content).toBe('Here is part of an answer');
    expect(m.error).toBe("The AI call was refused.");
  });

  it('an error before any text still records the error', () => {
    const s = useChatStore.getState();
    const id = s.startAssistant();
    s.fail(id, 'stream error');
    expect(msg(id).status).toBe('error');
    expect(msg(id).error).toBe('stream error');
  });

  it('done without an error completes the reply', () => {
    const s = useChatStore.getState();
    const id = s.startAssistant();
    s.appendToken(id, 'ok');
    s.complete(id);
    expect(msg(id).status).toBe('complete');
  });
});
