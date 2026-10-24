import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError, wrap } from "../middleware/errors.js";

export const assistantRouter = Router();
assistantRouter.use(requireAuth);
assistantRouter.use(rateLimit({ windowMs: 60_000, limit: 10 }));

const SYSTEM =
  "You are NASJ, a gentle, encouraging learning companion for children aged 3 to 10. " +
  "Answer in the language of the question (French or Arabic) in at most three short, simple sentences. " +
  "Stay on educational, child-appropriate topics. If asked about anything unsafe or unsuitable, kindly suggest asking a parent.";

assistantRouter.post(
  "/",
  wrap(async (req, res) => {
    const { question } = z.object({ question: z.string().trim().min(1).max(300) }).parse(req.body);
    if (!config.anthropicKey) throw new HttpError(503, "The assistant is not enabled on this server");
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-5-5",
        max_tokens: 200,
        system: SYSTEM,
        messages: [{ role: "user", content: question }],
      }),
    });
    if (!r.ok) throw new HttpError(502, "Assistant unavailable");
    const data: any = await r.json();
    res.json({ answer: data.content?.[0]?.text ?? "" });
  })
);
