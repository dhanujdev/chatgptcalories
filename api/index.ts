import handler from "../server/src/index.js";

// Vercel Serverless Function Config — Node.js runtime with streaming
export const config = {
    supportsResponseStreaming: true,
};

export default handler;
