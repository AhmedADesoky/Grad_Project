import Stripe from 'stripe';
import User from '../models/User.js';

// Lazy init so dotenv has time to load before Stripe reads the key
let _stripe = null;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

const PRICE_TO_TIER = {
  [process.env.STRIPE_PRO_PRICE_ID]:      'pro',
  [process.env.STRIPE_ULTIMATE_PRICE_ID]: 'ultimate',
};

const LIMITS = {
  free:     { plans: 4,  pdfs: 8,  chat: 20,  adjustments: 10, mode_changes: 2  },
  pro:      { plans: 10, pdfs: 15, chat: 80,  adjustments: 40, mode_changes: 4  },
  ultimate: { plans: 20, pdfs: 30, chat: 200, adjustments: 100, mode_changes: 8 },
};

// ── Reset counters if a new month has started ─────────────────────────────────
function _shouldReset(user) {
  if (!user.Usage_Reset_At) return true;
  const reset = new Date(user.Usage_Reset_At);
  const now = new Date();
  return now.getFullYear() > reset.getFullYear() ||
         now.getMonth()    > reset.getMonth();
}

async function _maybeReset(user) {
  if (_shouldReset(user)) {
    user.Plans_Used         = 0;
    user.PDFs_Used          = 0;
    user.Chat_Messages_Used = 0;
    user.Adjustments_Used   = 0;
    user.Mode_Changes_Used  = 0;
    user.Usage_Reset_At     = new Date();
    await user.save();
  }
}

// ── Get current usage + limits for a user ────────────────────────────────────
export async function getUsage(userId) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  await _maybeReset(user);

  const tier   = user.Subscription_Tier || 'free';
  const limits = LIMITS[tier];
  const resetDate = new Date(user.Usage_Reset_At || new Date());
  resetDate.setMonth(resetDate.getMonth() + 1);
  resetDate.setDate(1);

  return {
    tier,
    resets_at: resetDate.toISOString(),
    subscription_expires_at: user.Subscription_Expires_At?.toISOString() || null,
    usage: {
      plans:        { used: user.Plans_Used,         limit: limits.plans        },
      pdfs:         { used: user.PDFs_Used,          limit: limits.pdfs         },
      chat:         { used: user.Chat_Messages_Used, limit: limits.chat         },
      adjustments:  { used: user.Adjustments_Used,   limit: limits.adjustments  },
      mode_changes: { used: user.Mode_Changes_Used,  limit: limits.mode_changes },
    },
  };
}

// ── Read-only limit check (does not increment) ────────────────────────────────
export async function checkLimit(userId, counter) {
  const counterMap = {
    plans:        'Plans_Used',
    pdfs:         'PDFs_Used',
    chat:         'Chat_Messages_Used',
    adjustments:  'Adjustments_Used',
    mode_changes: 'Mode_Changes_Used',
  };

  const field = counterMap[counter];
  if (!field) throw new Error(`Unknown counter: ${counter}`);

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  await _maybeReset(user);

  const tier    = user.Subscription_Tier || 'free';
  const limits  = LIMITS[tier];
  const current = user[field] || 0;

  return {
    allowed: current < limits[counter],
    used:    current,
    limit:   limits[counter],
    tier,
  };
}

// ── Check a specific limit and optionally increment ───────────────────────────
export async function checkAndIncrement(userId, counter) {
  const counterMap = {
    plans:        'Plans_Used',
    pdfs:         'PDFs_Used',
    chat:         'Chat_Messages_Used',
    adjustments:  'Adjustments_Used',
    mode_changes: 'Mode_Changes_Used',
  };

  const field = counterMap[counter];
  if (!field) throw new Error(`Unknown counter: ${counter}`);

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  await _maybeReset(user);

  const tier   = user.Subscription_Tier || 'free';
  const limits = LIMITS[tier];
  const current = user[field] || 0;

  if (current >= limits[counter]) {
    return {
      allowed: false,
      used:    current,
      limit:   limits[counter],
      tier,
    };
  }

  user[field] = current + 1;
  await user.save();

  return {
    allowed: true,
    used:    user[field],
    limit:   limits[counter],
    tier,
  };
}

// ── Create Stripe Checkout session ───────────────────────────────────────────
export async function createCheckoutSession(userId, priceId, successUrl, cancelUrl) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  let customerId = user.Stripe_Customer_Id;
  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: user.Email,
      name:  user.User_Name,
      metadata: { userId: userId.toString() },
    });
    customerId = customer.id;
    user.Stripe_Customer_Id = customerId;
    await user.save();
  }

  const session = await getStripe().checkout.sessions.create({
    customer:   customerId,
    mode:       'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url:  cancelUrl,
    metadata: { userId: userId.toString() },
  });

  return { url: session.url, session_id: session.id };
}

// ── Create Stripe customer portal session (manage/cancel subscription) ────────
export async function createPortalSession(userId, returnUrl) {
  const user = await User.findById(userId);
  if (!user?.Stripe_Customer_Id) throw new Error('No Stripe customer found');

  const session = await getStripe().billingPortal.sessions.create({
    customer:   user.Stripe_Customer_Id,
    return_url: returnUrl,
  });

  return { url: session.url };
}

// ── Handle Stripe webhook events ──────────────────────────────────────────────
export async function handleWebhook(rawBody, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err.message}`);
  }

  const sub = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = sub;
      if (session.mode !== 'subscription') break;
      const userId = session.metadata?.userId;
      if (!userId) break;
      const subscription = await getStripe().subscriptions.retrieve(session.subscription);
      const priceId = subscription.items.data[0]?.price?.id;
      const tier = PRICE_TO_TIER[priceId] || 'free';
      await User.findByIdAndUpdate(userId, {
        Subscription_Tier:       tier,
        Stripe_Subscription_Id:  subscription.id,
        Subscription_Expires_At: new Date(subscription.current_period_end * 1000),
      });
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = sub;
      if (!invoice.subscription) break;
      const subscription = await getStripe().subscriptions.retrieve(invoice.subscription);
      const customerId = invoice.customer;
      const priceId = subscription.items.data[0]?.price?.id;
      const tier = PRICE_TO_TIER[priceId] || 'free';
      await User.findOneAndUpdate(
        { Stripe_Customer_Id: customerId },
        {
          Subscription_Tier:       tier,
          Subscription_Expires_At: new Date(subscription.current_period_end * 1000),
        }
      );
      break;
    }

    case 'customer.subscription.deleted':
    case 'customer.subscription.paused': {
      const customerId = sub.customer;
      await User.findOneAndUpdate(
        { Stripe_Customer_Id: customerId },
        {
          Subscription_Tier:       'free',
          Subscription_Expires_At: null,
          Stripe_Subscription_Id:  null,
        }
      );
      break;
    }
  }

  return { received: true };
}
