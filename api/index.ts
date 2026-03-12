import handler from "../server/src/index.js";

// Vercel Serverless Function Config
export const config = {
    runtime: 'edge',
};

export default handler;
