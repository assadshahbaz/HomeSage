import { TestBed } from '@angular/core/testing';

import { ChatSession } from './chat-session';

const STORED = '2f1c9a4e-8b7d-4c3a-9e6f-1a2b3c4d5e6f';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function session(): ChatSession {
  return TestBed.inject(ChatSession);
}

describe('ChatSession', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses the id stored by an earlier visit', () => {
    localStorage.setItem('hs-session-id', STORED);

    expect(session().id()).toBe(STORED);
  });

  it.each([
    ['nothing stored', null],
    ['a value that is not a UUID', 'abc'],
  ])('makes and stores a new id when there is %s', (_, stored) => {
    if (stored !== null) {
      localStorage.setItem('hs-session-id', stored);
    }

    const id = session().id();

    expect(id).toMatch(UUID);
    expect(localStorage.getItem('hs-session-id')).toBe(id);
  });

  it('starts a fresh id on renew and remembers it', () => {
    localStorage.setItem('hs-session-id', STORED);
    const chat = session();

    chat.renew();

    expect(chat.id()).not.toBe(STORED);
    expect(chat.id()).toMatch(UUID);
    expect(localStorage.getItem('hs-session-id')).toBe(chat.id());
  });

  it('still gives one steady id for the visit when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const chat = session();

    expect(chat.id()).toMatch(UUID);
    expect(chat.id()).toBe(chat.id());
    chat.renew();
    expect(chat.id()).toMatch(UUID);
  });
});
