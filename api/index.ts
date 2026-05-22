// Disable Vercel's default body parser so Express can parse raw JSON bodies correctly
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: any, res: any) {
  try {
    const { default: app } = await import("../server-app");
    return app(req, res);
  } catch (err: any) {
    console.error("Vercel Serverless Function module load error:", err);
    res.status(500).json({
      error: "Vercel Serverless Function module load error",
      message: err.message || String(err),
      stack: err.stack || "No stack trace available",
      hint: "Check environment variables and dependencies in server-app.ts"
    });
  }
}

