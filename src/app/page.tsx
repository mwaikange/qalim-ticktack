import TickTack from '@/components/ticktack';
export default function Page() {
  if (process.env.VERCEL && !(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) {
    return <main className="initial-loading"><h1>One more step to play.</h1><p>QALIM tickTack needs its Supabase connection for online accounts and matches.</p><p>Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel, run the database migration, then redeploy.</p></main>;
  }
  return <TickTack />;
}
