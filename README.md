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
- **Cloud Sync**: Optional Supabase integration for cross-device data consistency.

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

To enable cloud sync and authentication, run the following SQL in your Supabase project's SQL Editor to create the necessary tables and RLS policies:

<details>
<summary>Click to view SQL Schema</summary>

```sql
-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  preferences JSONB DEFAULT '{"units": "metric", "colorScale": "srm", "language": "en"}'::jsonb
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for existing users
INSERT INTO public.profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Create application tables with user_id and status
CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  data JSONB,
  user_id UUID REFERENCES auth.users,
  status TEXT DEFAULT 'private' CHECK (status IN ('private', 'submitted', 'approved'))
);
CREATE TABLE IF NOT EXISTS brew_logs (id TEXT PRIMARY KEY, data JSONB, user_id UUID REFERENCES auth.users);
CREATE TABLE IF NOT EXISTS tasting_notes (id TEXT PRIMARY KEY, data JSONB, user_id UUID REFERENCES auth.users);
CREATE TABLE IF NOT EXISTS fermentables (
  id TEXT PRIMARY KEY,
  data JSONB,
  user_id UUID REFERENCES auth.users,
  status TEXT DEFAULT 'private' CHECK (status IN ('private', 'submitted', 'approved'))
);
CREATE TABLE IF NOT EXISTS hops (
  id TEXT PRIMARY KEY,
  data JSONB,
  user_id UUID REFERENCES auth.users,
  status TEXT DEFAULT 'private' CHECK (status IN ('private', 'submitted', 'approved'))
);
CREATE TABLE IF NOT EXISTS cultures (
  id TEXT PRIMARY KEY,
  data JSONB,
  user_id UUID REFERENCES auth.users,
  status TEXT DEFAULT 'private' CHECK (status IN ('private', 'submitted', 'approved'))
);
CREATE TABLE IF NOT EXISTS styles (
  id TEXT PRIMARY KEY,
  data JSONB,
  user_id UUID REFERENCES auth.users,
  status TEXT DEFAULT 'private' CHECK (status IN ('private', 'submitted', 'approved'))
);
CREATE TABLE IF NOT EXISTS miscs (
  id TEXT PRIMARY KEY,
  data JSONB,
  user_id UUID REFERENCES auth.users,
  status TEXT DEFAULT 'private' CHECK (status IN ('private', 'submitted', 'approved'))
);
CREATE TABLE IF NOT EXISTS mash_profiles (
  id TEXT PRIMARY KEY,
  data JSONB,
  user_id UUID REFERENCES auth.users,
  status TEXT DEFAULT 'private' CHECK (status IN ('private', 'submitted', 'approved'))
);
CREATE TABLE IF NOT EXISTS equipment (id TEXT PRIMARY KEY, data JSONB, user_id UUID REFERENCES auth.users);
CREATE TABLE IF NOT EXISTS waters (id TEXT PRIMARY KEY, data JSONB, user_id UUID REFERENCES auth.users);

-- Enable Row Level Security (RLS)
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE brew_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fermentables ENABLE ROW LEVEL SECURITY;
ALTER TABLE hops ENABLE ROW LEVEL SECURITY;
ALTER TABLE cultures ENABLE ROW LEVEL SECURITY;
ALTER TABLE styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE miscs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mash_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE waters ENABLE ROW LEVEL SECURITY;

-- Helper to check if user is admin
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql SECURITY DEFINER;

-- RLS Policies for Data Tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['recipes', 'brew_logs', 'tasting_notes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles', 'equipment', 'waters'];
BEGIN
  FOR t IN SELECT unnest(tables)
  LOOP
    -- Everyone can read approved items (if the table has a status column)
    IF t IN ('recipes', 'fermentables', 'hops', 'cultures', 'styles', 'miscs', 'mash_profiles') THEN
      EXECUTE format('CREATE POLICY "Allow read approved %I" ON %I FOR SELECT USING (status = ''approved'');', t, t);
    END IF;

    -- Users can read/write their own items
    EXECUTE format('CREATE POLICY "Allow user manage own %I" ON %I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);', t, t);

    -- Admins can do everything
    EXECUTE format('CREATE POLICY "Allow admin manage %I" ON %I FOR ALL USING (is_admin());', t, t);
  END LOOP;
END $$;
```
</details>

### 4. Administrator Setup

By default, all new users are assigned the `user` role. To promote a user to `admin` (required to access the Admin panel and manage public ingredient submissions):

1. Create an account through the Brewbindr interface.
2. In your **Supabase Dashboard**, navigate to **Authentication > Users** to find your **User ID** (UUID).
3. Open the **SQL Editor** in Supabase and run the following command, replacing `YOUR_USER_UUID` with the actual ID:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE id = 'YOUR_USER_UUID';
   ```

### 5. Run Locally

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
