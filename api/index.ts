// @ts-expect-error Generated during `npm run build`; bundled by Vercel after build completes.
import handler from "../dist/server/server/src/index.js";

// Vercel Serverless Function Config — Node.js runtime with streaming
export const config = {
  supportsResponseStreaming: true,
};

export default handler;
