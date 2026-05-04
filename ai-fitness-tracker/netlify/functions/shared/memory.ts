/**
 * APEX Coach Memory Layer
 * - Extracts durable facts from conversations via Claude Haiku
 * - Stores/retrieves memories from Supabase ja_coach_memories table
 * - Formats memories for injection into the system prompt
 */

interface MemoryRow {
  id: string;
  profile_id: string;
  category: string;
  content: string;
  source: string;
  confidence: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface MemoryOperation {
  action: 'add' | 'update' | 'remove';
  category: string;
  content: string;
  replaces_id?: string;
}

// ── Fetch active memories for a profile ────────────────────────────

export async function fetchActiveMemories(
  profileId: string,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<MemoryRow[]> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/ja_coach_memories?profile_id=eq.${profileId}&active=eq.true&order=created_at.asc`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    },
  );
  if (!res.ok) return [];
  return res.json();
}

// ── Format memories for the system prompt ──────────────────────────

export function formatMemoriesForPrompt(memories: MemoryRow[]): string {
  if (!memories.length) return '';

  const lines = memories.map(m => `- [${m.category}] ${m.content}`);
  return `
COACH MEMORIES (things you know about this user from past conversations):
${lines.join('\n')}

Use these memories naturally — don't list them back to the user. Reference them when relevant to the conversation.`;
}

// ── Extract memories from a conversation pair ──────────────────────

export async function extractMemories(
  userMessage: string,
  assistantResponse: string,
  existingMemories: MemoryRow[],
  profileId: string,
  supabaseUrl: string,
  supabaseKey: string,
  anthropicKey: string,
): Promise<void> {
  try {
    const existingList = existingMemories.length > 0
      ? existingMemories.map(m => `[${m.id}] [${m.category}] ${m.content}`).join('\n')
      : '(no existing memories)';

    const extractionPrompt = `You are a memory extraction system for a fitness coaching AI. Given a conversation exchange, extract any durable facts worth remembering across sessions.

EXISTING MEMORIES:
${existingList}

LATEST EXCHANGE:
User: ${userMessage}
Assistant: ${assistantResponse}

Extract genuinely durable facts — NOT transient things like "ate pizza today" or "is at the gym right now."

Good extractions: injuries, food preferences/dislikes, training preferences, life context (family, work stress), long-term goals, recurring patterns, supplement protocols, schedule preferences, medical conditions.

Categories: preference, injury, goal, life_context, pattern, dislike, note

If an existing memory should be updated (new info supersedes old), use "update" with the existing memory's ID.
If an existing memory is now wrong/outdated, use "remove" with the existing memory's ID.

Return ONLY a JSON array. Return [] if nothing worth remembering was said.

Example:
[{"action":"add","category":"injury","content":"Torn labrum in left shoulder — avoid overhead pressing"},{"action":"update","category":"goal","content":"Training for powerlifting meet in October 2026","replaces_id":"uuid-here"}]`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: extractionPrompt }],
      }),
    });

    if (!res.ok) return;
    const result = await res.json();
    const text = result.content?.[0]?.text || '';

    // Parse the JSON array from the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    let operations: MemoryOperation[];
    try {
      operations = JSON.parse(jsonMatch[0]);
    } catch {
      return;
    }

    if (!Array.isArray(operations) || operations.length === 0) return;

    // Process each operation
    for (const op of operations) {
      if (op.action === 'add' && op.content && op.category) {
        await supabaseInsert(supabaseUrl, supabaseKey, 'ja_coach_memories', {
          profile_id: profileId,
          category: op.category,
          content: op.content,
          source: 'extracted',
          confidence: 0.8,
          active: true,
        });
      } else if (op.action === 'update' && op.replaces_id && op.content) {
        // Mark old memory as superseded
        const newId = crypto.randomUUID();
        await supabaseUpdate(supabaseUrl, supabaseKey, 'ja_coach_memories', op.replaces_id, {
          active: false,
          superseded_by: newId,
          updated_at: new Date().toISOString(),
        });
        // Insert new memory
        await supabaseInsert(supabaseUrl, supabaseKey, 'ja_coach_memories', {
          id: newId,
          profile_id: profileId,
          category: op.category,
          content: op.content,
          source: 'extracted',
          confidence: 0.85,
          active: true,
        });
      } else if (op.action === 'remove' && op.replaces_id) {
        await supabaseUpdate(supabaseUrl, supabaseKey, 'ja_coach_memories', op.replaces_id, {
          active: false,
          updated_at: new Date().toISOString(),
        });
      }
    }
  } catch {
    // Memory extraction is non-critical — never fail the chat
  }
}

// ── Supabase helpers (lightweight, no SDK) ─────────────────────────

async function supabaseInsert(
  url: string, key: string, table: string, data: Record<string, unknown>,
): Promise<void> {
  await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  });
}

async function supabaseUpdate(
  url: string, key: string, table: string, id: string, data: Record<string, unknown>,
): Promise<void> {
  await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  });
}
