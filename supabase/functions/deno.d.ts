/**
 * Minimal ambient declarations for the Deno global available in the
 * Supabase Edge Functions runtime. This repo's `tsc -b` build (see
 * tsconfig.app.json / tsconfig.node.json) does not include `supabase/functions`,
 * so this file only exists to silence editor/IDE errors when authoring
 * Edge Functions locally — actual type checking of these files happens in
 * the Deno runtime when deployed via the Supabase CLI, not via this repo's
 * TypeScript build.
 */
declare namespace Deno {
  function serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void;

  const env: {
    get(key: string): string | undefined;
  };
}
