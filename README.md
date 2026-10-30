<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Brewbindr

A comprehensive beer brewing companion for creating recipes in BeerJSON format, tracking brew logs, and recording tasting notes with AI-powered recipe generation and analysis.

## Features

- **AI Recipe Generation**: Generate complete BeerJSON recipes from simple text prompts using Google Gemini.
- **Brew Log Tracking**: Record your brew day details, from mash temperatures to fermentation gravity.
- **Tasting Analysis**: Get AI-powered feedback on your tasting notes compared to your original recipe specifications.
- **Ingredient Library**: Manage your own collection of fermentables, hops, cultures, and more.
- **BeerXML Support**: Import and export recipes and libraries in the industry-standard BeerXML format.
- **Multi-language Support**: Available in English, Dutch, and French.
- **Realtime Connection**: Supabase integration for live, cross-device data consistency.

## Prerequisites

- **Node.js**: Version 18 or higher.
- **Supabase Account**: Required for data persistence and authentication.
- **Google Gemini API Key**: Required for AI-powered features.

## Getting Started

### 1. Clone and Install

```bash
git clone <repository-url>
cd brewbindr
npm install
```

### 2. Configuration

Create a `.env.local` file in the root directory and add your credentials:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# AI Configuration (Google Gemini)
GEMINI_API_KEY=your_gemini_api_key
```

### 3. Database Setup

To enable cloud sync and authentication, run [`schema_update.sql`](schema_update.sql) in your Supabase project's SQL Editor. It creates all tables, RLS policies, triggers and functions, and is idempotent, so it is also safe to re-run on an existing database. The same script is shown in the app under **Connection Details**.

Incremental changes for existing databases are kept in [`migrations/`](migrations/).

### 4. Security Recommendations

To enhance the security of your Brewbindr installation, it is strongly recommended to:

- **Enable Leaked Password Protection**: In your **Supabase Dashboard**, navigate to **Authentication > Attack Protection** and enable **Leaked Password Protection**. This prevents users from using passwords that have been compromised in data breaches.
- **Enable Row-Level Security (RLS)**: The provided SQL schema already enables RLS on all tables. Always ensure RLS is active to prevent unauthorized data access.

### 5. Administrator Setup

By default, all new users are assigned the `user` role. To promote a user to `admin` (required to access the Admin panel and manage public ingredient submissions):

1. Create an account through the Brewbindr interface.
2. In your **Supabase Dashboard**, navigate to **Authentication > Users** to find your **User ID** (UUID).
3. Open the **SQL Editor** in Supabase and run the following command, replacing `YOUR_USER_UUID` with the actual ID:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE id = 'YOUR_USER_UUID';
   ```

### 6. Run Locally

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

> **Note**: To test the AI features locally, you may need to use [Vercel CLI](https://vercel.com/docs/cli) with `vercel dev` to run the serverless functions in the `api/` directory.

## Deployment

This application is optimized for deployment on [Vercel](https://vercel.com).

1. Push your code to a GitHub repository.
2. Import the project into Vercel.
3. Add the required environment variables in the Vercel Project Settings.
4. Vercel will automatically handle the build and deployment of both the frontend and the serverless functions.

---
© 2026 Jan Sierens — Brewbindr. All rights reserved.
