# AI Chat Slide-over Panel — Implementation Handoff

Prototype yang jadi acuan (ada pada folder docs\ideas\prototypes\ai-chat-prototype): `Journey & Cashflow.html` + `pf-chat.jsx` + `pf-app.jsx` (project design "Personal Finance"). Keputusan desain: **Opsi A — slide-over panel**, bukan halaman `/chat` di kolom Recent maupun split 50/50.

## Ringkasan keputusan
- AI Chat menjadi **panel slide-over ±420px** di sisi kanan AppShell, menggantikan `ActivityPanel` (Recent) saat terbuka. Tersedia dari **semua halaman**.
- **Shortcut `Ctrl/Cmd + I`** toggle buka/tutup (Ctrl+. tetap focus mode). Plus tombol trigger ✦ (Sparkles) di top-right main area, di samping tombol focus mode.
- Item **"AI Chat" dihapus dari nav Foundations** di Sidebar. Route `/chat` tetap ada sebagai **expanded mode** (tombol ⤢ di header panel).
- Recent tidak redundant: saat panel terbuka, citation transaksi di jawaban chat menggantikan fungsinya.

## File yang berubah (codebase asli — `apps/frontend/src`)

1. **`components/Sidebar.tsx`** — hapus item nav "AI Chat" dari section Foundations (L1).
2. **`components/AppShell.tsx`** —
   - Tambah state `chatOpen` (persist ke localStorage, key mis. `pf_chat_open`).
   - Render `<AiChatPanel />` menggantikan `<ActivityPanel />` saat `chatOpen`.
   - Tambah tombol trigger Sparkles di div `absolute top-4 right-4` (sebelum tombol focus mode), aria-label "Ask AI — Ctrl+I", state aktif: `text-success bg-success/10`.
3. **`hooks/useAiPanelShortcut.ts`** *(baru)* — pola sama dengan `useFocusModeShortcut.ts`: `(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i'` → `preventDefault()` + toggle. Pastikan tidak bentrok dengan italic shortcut di input teks bila ada rich editor.
4. **`components/chat/AiChatPanel.tsx`** *(baru)* — panel slide-over. Ekstrak logika chat dari `pages/ChatPage.tsx` (streamAsk, messages, contexts, stop/abort) ke hook bersama **`hooks/useChatSession.ts`** agar dipakai panel & full page tanpa duplikasi.
5. **`pages/ChatPage.tsx`** — refactor untuk memakai `useChatSession`; tetap sebagai expanded mode di route `/chat`.
6. **`App.tsx`** — route `/chat` dipertahankan; tidak ada route baru.

## Spesifikasi AiChatPanel (ikuti prototype `pf-chat.jsx`)

Kontainer: `w-[420px] flex-shrink-0 flex flex-col h-full bg-card border-l border-border`, shadow `-14px 0 32px rgba(0,0,0,.07)`.

**Header (h-14, border-b):**
- Icon Sparkles dalam kotak 28px `bg-success/10 text-success rounded-lg`.
- Judul "Ask your finances" (13px semibold) + subteks model & konteks halaman aktif (10px muted), mis. "Gemini … · konteks: Cashflow" — ambil dari route aktif.
- Kanan: badge kbd `Ctrl + I`, tombol Maximize2 → `navigate('/chat')`, tombol X → tutup panel.

**Messages (flex-1, overflow-y-auto, gap 14px):**
- User bubble: `self-end max-w-[85%] bg-secondary rounded-2xl rounded-br-md px-3.5 py-2 text-[13px]`.
- Assistant: plain text `max-w-[95%] text-[13px] leading-relaxed`, tanpa bubble.
- **Citation card** (dari `contexts` hasil `onMetadata`): border rounded-xl; header kecil uppercase "Sumber · N transaksi"; tiap baris = tanggal (10px muted, lebar tetap) · deskripsi (truncate, mono) · amount rata kanan (`text-expense`/income, tabular-nums). Ini pengganti list "Sumber transaksi" polos di ChatPage lama — WAJIB kompak karena lebar 420px.
- Suggestion chips (pill border, 11px) opsional di bawah jawaban terakhir.

**Input (border-t):** input `bg-secondary border rounded-lg text-[13px]` + tombol Kirim `bg-foreground text-background`. Enter = kirim; saat streaming tampilkan tombol Stop (abort). Auto-focus input saat panel dibuka.

**Behavior:**
- Auto-scroll ke bawah saat pesan bertambah — **jangan pakai `scrollIntoView`**; set `scrollTop = scrollHeight` pada container scroll.
- Session chat dipertahankan saat panel ditutup/dibuka (state hidup di AppShell atau context, bukan di dalam panel).
- Panel & ActivityPanel saling eksklusif; transisi boleh ditambah (slide dari kanan, ~200ms) dengan respect `prefers-reduced-motion`.

## Prompt untuk Claude Code

```
Implement the AI chat slide-over panel per docs/ai-chat-panel-handoff.md (design decision: Option A).

1. Remove the "AI Chat" nav item from the Foundations section in src/components/Sidebar.tsx. Keep the /chat route.
2. Create src/hooks/useChatSession.ts by extracting the chat logic (messages, contexts, streaming, streamAsk, abort) from src/pages/ChatPage.tsx so it can be shared.
3. Create src/components/chat/AiChatPanel.tsx: a 420px right-hand slide-over panel styled per the spec in the handoff doc (header with Sparkles icon + "Ctrl + I" kbd badge + expand-to-/chat + close; message list with compact citation card; input with send/stop). Use existing tokens (bg-card, border-border, bg-secondary, text-expense, success) and lucide-react icons.
4. In src/components/AppShell.tsx: add chatOpen state persisted to localStorage; render AiChatPanel instead of ActivityPanel when open; add a Sparkles ghost-button trigger next to the focus-mode toggle (tooltip "Ask AI — ⌘I").
5. Create src/hooks/useAiPanelShortcut.ts following useFocusModeShortcut.ts: Ctrl/Cmd+I toggles the panel, preventDefault. Ctrl+. must keep toggling focus mode.
6. Refactor src/pages/ChatPage.tsx to use useChatSession; it remains the expanded/full-page mode.
7. Keep chat session state alive across panel open/close (lift to AppShell or a context provider).
Do not use scrollIntoView for auto-scroll; set scrollTop on the scroll container instead.
```
