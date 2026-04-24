// src/modules/subscriptions/subscriptions.routes.js
import express from "express";
import Stripe from "stripe";
import supabase from "../../config/supabase.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ─── Price IDs de Stripe — créalos en dashboard.stripe.com/products ──────────
// Luego pon los IDs en tu .env
const PRICE_IDS = {
  2: process.env.STRIPE_PRICE_BASICO,       // $49/mes
  3: process.env.STRIPE_PRICE_PROFESIONAL,  // $149/mes
  4: process.env.STRIPE_PRICE_BUSINESS,     // $349/mes
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/subscriptions/create-session
// Crea una Stripe Checkout Session y devuelve la URL de pago
// ─────────────────────────────────────────────────────────────────────────────
router.post("/create-session", verifyToken, async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.user.id;

    // 1. Verificar que el plan existe en BD
    const { data: plan, error: planErr } = await supabase
      .from("plan")
      .select("*")
      .eq("id_plan", planId)
      .eq("activo", true)
      .single();

    if (planErr || !plan) {
      return res.status(404).json({ ok: false, error: "Plan no encontrado" });
    }

    if (!plan.precio_mensual) {
      return res.status(400).json({
        ok: false,
        error: "Este plan requiere contacto directo. Escríbenos a contacto@uceparking.com"
      });
    }

    const priceId = PRICE_IDS[planId];
    if (!priceId) {
      return res.status(400).json({
        ok: false,
        error: `Price ID de Stripe no configurado para el plan ${plan.nombre}. Revisa tu .env`
      });
    }

    // 2. Obtener datos del usuario autenticado
    const { data: usuario } = await supabase
      .from("usuario")
      .select("organizacion_id, persona:id_persona(nombre, apellido, email)")
      .eq("id", userId)
      .maybeSingle();

    const orgId = usuario?.organizacion_id ?? 1;
    const email = usuario?.persona?.email ?? req.user.email;
    const nombre = usuario?.persona
      ? `${usuario.persona.nombre} ${usuario.persona.apellido}`
      : email;

    // 3. Buscar o crear customer de Stripe
    let stripeCustomerId = null;

    const { data: subActual } = await supabase
      .from("suscripcion")
      .select("stripe_customer_id")
      .eq("organizacion_id", orgId)
      .maybeSingle();

    if (subActual?.stripe_customer_id) {
      stripeCustomerId = subActual.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email,
        name: nombre,
        metadata: { organizacion_id: String(orgId), user_id: userId }
      });
      stripeCustomerId = customer.id;
    }

    // 4. Crear sesión de Checkout
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5500";

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}?success=true&plan=${encodeURIComponent(plan.nombre)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${frontendUrl}?canceled=true`,
      metadata: {
        organizacion_id: String(orgId),
        plan_id: String(planId),
        user_id: userId
      },
      subscription_data: {
        metadata: { organizacion_id: String(orgId), plan_id: String(planId) }
      },
      locale: "es"
    });

    res.json({ ok: true, url: session.url, sessionId: session.id });

  } catch (err) {
    console.error("[subscriptions] create-session:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/subscriptions/webhook
// Recibe eventos de Stripe (requiere raw body — configurado en app.js)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("[webhook] Firma inválida:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {

      // Pago exitoso → activar suscripción en BD
      case "checkout.session.completed": {
        const session = event.data.object;
        const { organizacion_id, plan_id } = session.metadata;

        const ahora = new Date();
        const vencimiento = new Date(ahora);
        vencimiento.setMonth(vencimiento.getMonth() + 1);

        await supabase.from("suscripcion").upsert({
          organizacion_id: Number(organizacion_id),
          id_plan: Number(plan_id),
          id_estado: 1,
          fecha_inicio: ahora.toISOString(),
          fecha_vencimiento: vencimiento.toISOString(),
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription
        }, { onConflict: "organizacion_id" });

        console.log(`[webhook] ✅ Plan ${plan_id} activado para org ${organizacion_id}`);
        break;
      }

      // Renovación mensual exitosa
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        if (invoice.billing_reason !== "subscription_cycle") break;

        const vencimiento = new Date();
        vencimiento.setMonth(vencimiento.getMonth() + 1);

        await supabase.from("suscripcion")
          .update({ id_estado: 1, fecha_vencimiento: vencimiento.toISOString() })
          .eq("stripe_subscription_id", invoice.subscription);

        console.log(`[webhook] 🔄 Renovación exitosa — ${invoice.subscription}`);
        break;
      }

      // Pago fallido
      case "invoice.payment_failed": {
        await supabase.from("suscripcion")
          .update({ id_estado: 3 }) // Vencida
          .eq("stripe_subscription_id", event.data.object.subscription);
        console.log(`[webhook] ❌ Pago fallido — ${event.data.object.subscription}`);
        break;
      }

      // Cancelación
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await supabase.from("suscripcion")
          .update({ id_estado: 2, cancelada_en: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);
        console.log(`[webhook] 🚫 Cancelada — ${sub.id}`);
        break;
      }
    }
  } catch (err) {
    console.error("[webhook] Error procesando evento:", err.message);
  }

  res.json({ received: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/subscriptions/my-plan
// Devuelve el plan actual del usuario autenticado
// ─────────────────────────────────────────────────────────────────────────────
router.get("/my-plan", verifyToken, async (req, res) => {
  try {
    const { data: usuario } = await supabase
      .from("usuario")
      .select("organizacion_id")
      .eq("id", req.user.id)
      .maybeSingle();

    if (!usuario?.organizacion_id) {
      return res.json({ ok: true, suscripcion: null });
    }

    const { data } = await supabase
      .from("suscripcion")
      .select("*, plan(*)")
      .eq("organizacion_id", usuario.organizacion_id)
      .maybeSingle();

    res.json({ ok: true, suscripcion: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/subscriptions/cancel
// Cancela la suscripción al final del período pagado
// ─────────────────────────────────────────────────────────────────────────────
router.post("/cancel", verifyToken, async (req, res) => {
  try {
    const { data: usuario } = await supabase
      .from("usuario")
      .select("organizacion_id")
      .eq("id", req.user.id)
      .maybeSingle();

    const { data: sub } = await supabase
      .from("suscripcion")
      .select("stripe_subscription_id")
      .eq("organizacion_id", usuario?.organizacion_id)
      .maybeSingle();

    if (sub?.stripe_subscription_id) {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true
      });
    }

    await supabase.from("suscripcion")
      .update({ id_estado: 2, cancelada_en: new Date().toISOString() })
      .eq("organizacion_id", usuario?.organizacion_id);

    res.json({ ok: true, message: "Suscripción cancelada al final del período" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;