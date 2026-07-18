# Mendi Coat Multiplayer

A production-oriented Next.js + TypeScript multiplayer implementation for the Mendi Coat card game.

## Stack
- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- Socket.IO
- Prisma ORM
- Supabase PostgreSQL
- Auth.js
- shadcn/ui-ready structure

## Current milestone
- Authentication routes
- Prisma schema and client generation
- Room creation and waiting room flow
- Server-authoritative game engine skeleton
- Socket.IO room management

## Getting started
1. Install dependencies: npm install
2. Copy .env.example to .env.local and fill in the values.
3. Run Prisma migrations against your Supabase database.
4. Start the dev server: npm run dev
