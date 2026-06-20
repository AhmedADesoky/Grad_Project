import express from 'express';
import dotenv from 'dotenv';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { typeDefs, resolvers } from './graphql/index.js';
import { buildContext } from './middleware/auth.js';
import { ConnectDB } from './config/db.js';
import { startAllJobs } from './services/schedulerService.js';
import { startExamWorker } from './queue/examWorker.js';
import { handleWebhook } from './services/subscriptionService.js';
import authRoutes from './routes/authRoutes.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import nodemailer from 'nodemailer';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  })
);

app.use(cookieParser());

// Stripe webhook needs raw body — must be registered BEFORE express.json()
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  try {
    await handleWebhook(req.body, sig);
    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/auth', authRoutes);

const server = new ApolloServer({ typeDefs, resolvers });

async function verifyEmailConfig() {
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const user = process.env.GMAIL_USER;
  if (!user || !pass) {
    console.error('[Email] GMAIL_USER or GMAIL_APP_PASSWORD not set — emails will not send');
    return;
  }
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
  try {
    await transporter.verify();
    console.log(`[Email] SMTP connection verified — emails will send from ${user}`);
  } catch (err) {
    console.error('[Email] SMTP verification FAILED:', err.message);
    console.error('[Email] Fix: ensure 2-Step Verification is ON and App Password is valid at https://myaccount.google.com/apppasswords');
  }
}

async function startServer() {
  await ConnectDB();
  await server.start();

  const graphqlLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,                  // 300 requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { errors: [{ message: 'Too many requests. Please try again later.' }] },
  });

  app.use(
    '/graphql',
    graphqlLimiter,
    expressMiddleware(server, {
      context: buildContext,
    })
  );

  app.listen(port, () => {
    console.log('Server ready at port ' + port);
    startAllJobs();
    startExamWorker();
    verifyEmailConfig();
  });
}

startServer().catch((err) => console.error('Server startup error:', err));