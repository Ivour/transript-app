import { useAuth } from "../hooks/useAuth";

/**
 * Main (and only, besides /login) screen of the app. The live transcription
 * UI (audio capture, Soniox WebSocket, diarized transcript) will be built
 * here in a later step — not implemented yet.
 */
export default function TranscribePage() {
  const { user, signOut } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <span className="text-sm text-slate-500">{user?.email}</span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Odhlásit se
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center p-4 text-slate-400">
        Přepis se připravuje…
      </main>
    </div>
  );
}
