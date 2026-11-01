import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      tailwindcss(),
    ],
    define: {
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL),
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
      rolldownOptions: {
        output: {
          // Libraries in their own files: they change rarely, so browsers keep
          // them cached across app releases. Screens are split via React.lazy.
          codeSplitting: {
            groups: [
              { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
              { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            ],
          },
        },
      },
    }
  };
});
