import app from "../server-app";

// Disable Vercel's default body parser so Express can parse raw JSON bodies correctly
export const config = {
  api: {
    bodyParser: false,
  },
};

export default app;
