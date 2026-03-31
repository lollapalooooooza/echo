# <div align="center">🐣 EchoNest</div>

<div align="center">
  <img src="./public/brand/echonest-mascot.png" alt="EchoNest mascot" width="180" />

  <h3>Turn writing into a living AI character with voice, video, memory, and vibes.</h3>

  <p>
    <strong>EchoNest</strong> lets creators upload articles, crawl websites, build a knowledge library,
    choose a voice, generate a live avatar, and publish a character people can actually talk to.
  </p>

  <p>
    <img alt="Next.js" src="https://img.shields.io/badge/Next.js-14-black?style=flat-square" />
    <img alt="Prisma" src="https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square" />
    <img alt="Runway" src="https://img.shields.io/badge/Runway-Live%20Avatar-111827?style=flat-square" />
    <img alt="ElevenLabs" src="https://img.shields.io/badge/ElevenLabs-Voice-F97316?style=flat-square" />
    <img alt="Anthropic" src="https://img.shields.io/badge/Anthropic-Chat-D97706?style=flat-square" />
    <img alt="OpenAI" src="https://img.shields.io/badge/OpenAI-Embeddings%20%26%20Summaries-10A37F?style=flat-square" />
    <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres%20%2B%20pgvector-3ECF8E?style=flat-square" />
  </p>
</div>

---

## ✨ What Makes EchoNest Fun?

- 📚 Turn blogs, uploads, and pasted text into a searchable knowledge brain
- 🕸️ Crawl entire websites and keep organizing sources into folders by domain
- 🎙️ Pick a preset voice or build your own custom voice library
- 🧠 Answer with retrieval-augmented chat grounded in real source material
- 🎥 Generate Runway-powered live characters for face-to-face conversations
- 💬 Fall back to a voice-first chat room with synced captions and transcript UI
- 🧾 Show article previews and citations while the character is answering
- 📈 Review analytics, user digest, per-character insights, and chat history
- 🧩 Embed a character on another site with a widget script

## 🪄 Product Flow

```text
Knowledge in → embeddings + summaries → character setup → voice + avatar →
published lobby → live conversation → transcripts + analytics
```

## 🏗️ Core Features

### 1. Knowledge Studio
- Upload documents, paste text, or crawl a site
- Group sources by main domain and continue crawling in batches
- Compress and summarize content before syncing to Runway
- Store chunks in Postgres with vector embeddings for retrieval

### 2. Character Builder
- Create a personality, greeting, avatar, and suggested questions
- Link selected knowledge sources to a character
- Choose from live voice presets or your own custom voice library
- Sync knowledge into Runway documents automatically

### 3. Live Rooms
- Use a real Runway live session when available
- Fall back to a polished voice chat room when live video is unavailable
- Show synced rolling captions, transcripts, citations, and article previews

### 4. Creator Dashboard
- Manage characters, knowledge, voices, and user profiles
- Track recent conversations and content themes
- Review digest-style analytics by character and by audience behavior

## 🧠 Tech Stack

### Frontend
- `Next.js 14`
- `React 18`
- `Tailwind CSS`
- `Radix UI`

### Backend + Data
- `Prisma`
- `PostgreSQL / Supabase`
- `pgvector`
- `NextAuth`

### AI + Media
- `Anthropic` for conversational response generation
- `OpenAI` for embeddings and knowledge summarization
- `Runway` for live avatars and avatar knowledge documents
- `ElevenLabs` for speech synthesis and custom voices
- `Firecrawl` for web mapping/crawling
- `Scrapling` as an optional advanced scraping path when Python is installed

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in your provider keys in `.env.local`.

### 3. Prepare the database

```bash
npm run db:push
```

### 4. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 🔐 Environment Variables

EchoNest expects these main keys:

```env
DATABASE_URL=
DIRECT_URL=

NEXTAUTH_SECRET=
NEXTAUTH_URL=
NEXT_PUBLIC_APP_URL=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_ID=
GITHUB_SECRET=

ANTHROPIC_API_KEY=
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
RUNWAY_API_KEY=
FIRECRAWL_API_KEY=

NEXT_PUBLIC_DEV_AUTH=
RATE_LIMIT_PER_MINUTE=
```

Notes:
- `DATABASE_URL` should use the Supabase transaction pooler for serverless runtime
- `DIRECT_URL` should use the direct/session connection for Prisma schema commands
- `NEXT_PUBLIC_DEV_AUTH=true` is handy locally, but should be `false` in production

## 🧪 Useful Commands

```bash
npm run dev
npm run build
npm run start

npm run db:generate
npm run db:push
npm run db:setup
npm run db:migrate
npm run db:seed
npm run db:studio
```

## 🗂️ Project Map

```text
src/app                 Next.js routes, pages, and API handlers
src/components          Character rooms, sidebars, selectors, brand UI
src/services            Chat, voices, scraping, Runway, ingestion, embeddings
src/lib                 Auth, db, env, helpers, UI utilities
prisma                  Prisma schema and seed logic
public                  Brand assets and widget bundle
```

## 🎯 A Few Nice Details

- Knowledge is compressed before being uploaded to Runway so it fits document limits
- If a character has more than 50 linked sources, EchoNest bundles them automatically
- Transcript UI, article preview cards, and fallback chat are designed to stay useful even when live video is unavailable
- The creator flow is built for iterative editing: voices, knowledge, avatars, and analytics all stay connected

## 🧱 Deployment Notes

### Vercel
- Build command: `npm run build`
- Do **not** run `prisma db push` on every deploy
- Make sure production env vars are set in Vercel

### Supabase
- Enable `vector` and `pgcrypto`
- Use pooled runtime connections for app traffic
- Use the direct connection for schema operations

### Runway
- Avatar knowledge sync is verified after upload
- Runway has document count limits, so EchoNest bundles oversized knowledge sets automatically

## 🌼 Why This Exists

Most creators already have the hard part: the ideas.

EchoNest is about turning those ideas into something people can talk to, hear, question, and explore like a living library instead of a static archive.

## 🤝 Contributing

If you're hacking on this project:

- keep the creator experience playful but clear
- preserve the established EchoNest visual language
- prefer shipping real end-to-end flows over placeholder UI
- test build stability before pushing

## 🐥 Final Note

If ChatGPT, a podcast, a little yellow mascot, and a knowledge graph had a baby... it would probably look a lot like EchoNest.
