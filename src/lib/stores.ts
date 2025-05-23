// src/lib/stores.ts
import { persisted } from 'svelte-persisted-store';
import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';

// Types are defined in src/global.d.ts and are globally available

/**
 * List of all LangGraph thread IDs known to this client. Acts as an index.
 * Synced with localStorage key 'superego_knownThreads'.
 */
export const knownThreadIds = persisted<string[]>('superego_knownThreads', []);

/**
 * Holds state for ALL UI sessions/tabs, keyed by sessionId.
 * Maps UI tabs to backend thread IDs.
 * Synced with localStorage key 'superego_uiSessions'.
 */
export const uiSessions = persisted<Record<string, UISessionState>>('superego_uiSessions', {});

/**
 * Tracks the sessionId of the currently viewed session/tab
 */
export const activeSessionId: Writable<string | null> = writable(null);

/**
 * Central cache holding the latest known state and status for each thread.
 * Keyed by threadId. NOT persisted.
 */
export const threadCacheStore: Writable<Record<string, ThreadCacheData>> = writable({});



/**
 * Tracks the threadId of the configuration card currently being edited
 */
export const activeConfigEditorId: Writable<string | null> = writable(null);

/** Store for displaying global errors */
export const globalError: Writable<string | null> = writable(null);