import { Langfuse } from 'langfuse'

export type LangfuseTrace = ReturnType<Langfuse['trace']>

const langfuse =
  process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY
    ? new Langfuse({
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
        flushAt: 1,
      })
    : null

if (langfuse) {
  console.log('[Langfuse] client initialized, baseUrl:', process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com')
} else {
  console.warn('[Langfuse] missing env vars — tracing disabled')
}

export default langfuse
