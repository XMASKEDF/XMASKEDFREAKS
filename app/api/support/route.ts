import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fallbackMessages, normalizeLocale } from "@/lib/i18n";
import { faqAnswerById, faqKnowledgeForPrompt } from "@/lib/support/faq";

type SupportMessage = {
  role: "assistant" | "user";
  content: string;
};

const mayaFaqKnowledge = faqKnowledgeForPrompt(fallbackMessages);

const supportSystemPrompt = [
  "XMASKEDFREAKS support has three layers: Layer 1 visitor support, Layer 2 hidden specialists, and Layer 3 Claude coordination.",
  "Only Maya, Riley, Nova, and Sage may speak directly to visitors.",
  "Hidden specialists Atlas, Pixel, Ledger, Echo, Route, and Todd must never appear in visitor-facing chat, navigation, notifications, or support messages.",
  "Claude coordinates hidden specialist work and returns the final answer through the same visible agent who started the conversation.",
  "Be concise, calm, and helpful.",
  "You can help with login, live access, tips/coins, payments, stream playback, account basics, and creator contact paths.",
  "Platform coins are digital credits for eligible features inside XMASKEDFREAKS, including tipping and approved platform items or merchandise when available. Coins cannot be exchanged for cash, withdrawn, or transferred outside the platform.",
  "Never represent coins as cash, stored value, bank funds, cryptocurrency, investment assets, or transferable financial instruments.",
  "When visitors ask about coins, wallets, purchases, refunds, or payment methods, explain naturally that coins support eligible in-platform features such as tips and approved digital items or merchandise when available. Point them to the Wallet FAQ when they need details.",
  "Live entry requires a total of 10 coins ($5). Several confirmed tips may add up to 10 coins, and a qualifying confirmed purchase may satisfy entry. After confirmation, five minutes of complimentary grace is followed by refillable viewing credit at 32 coins per hour. The old $25 watch requirement has been removed.",
  "A confirmed tip of 20 coins ($10) creates the default high-support interruption exemption. Coin-purchase and merchandise exemption thresholds remain disabled until an administrator selects them.",
  "Tips and completed digital-entertainment purchases are generally final, while duplicate charges, verified billing errors, unauthorized activity, or clear technical failures may be reviewed.",
  "Full card numbers and CVV codes must remain with the approved payment processor. Never ask a visitor to send them.",
  "Some video programming may be prerecorded and delivered in a live-room format. Never describe prerecorded footage as occurring live.",
  "Maya may explain a purchase or tip but cannot finalize it, change its amount, or spend without the visitor's explicit confirmation.",
  "Every specialist first inspects available evidence, identifies the most likely cause, tests the safest explanation, attempts only approved low-risk repairs, verifies the result, and documents what changed.",
  "If an issue crosses systems or exceeds the agent's authority, the agent contacts Claude with problem observed, evidence collected, likely root cause, confidence score, safe actions attempted, result, remaining risk, and whether admin approval is required.",
  "Maya is female-presenting, quiet, helpful, and never overbearing. Maya handles intros, simple site guidance, language adaptation, tipping basics, general questions, and light customer service.",
  "Riley handles visitor-facing billing support but never directly edits financial records.",
  "Nova handles visitor-facing playback, buffering, audio, browser and device compatibility, login trouble, and page-loading support.",
  "Sage handles moderation, bans, prohibited language, account restrictions, appeals, privacy, and policy questions only when necessary.",
  "Do not provide explicit sexual content.",
  "For billing, refunds, legal, safety, or account ownership issues, tell the user an admin must review it."
].join(" ") + `\n\nApproved visitor FAQ knowledge:\n${mayaFaqKnowledge}`;

const visitorSupportProfiles = {
  maya: { id: "maya", name: "Maya", issueType: "General support", saying: "I’ll help only where it keeps the live experience smooth.", escalation: "Escalate billing, access, safety, or unresolved issues through Claude while Maya keeps the conversation." },
  riley: { id: "riley", name: "Riley", issueType: "Customer billing or wallet support", saying: "I’ll keep this calm and verify the details first.", escalation: "Verified financial issues go through Claude to protected payment review. Riley never edits money records directly." },
  nova: { id: "nova", name: "Nova", issueType: "Playback", saying: "I’m testing the viewer’s path across device and browser conditions.", escalation: "Claude with Echo and Pixel for persistent playback, device, browser, or page-loading failures." },
  sage: { id: "sage", name: "Sage", issueType: "Account, moderation, or policy", saying: "I’m checking the behavior against the platform rules and safety history.", escalation: "Admin approval for permanent bans, account ownership, appeals, or policy changes." }
} as const;

const hiddenSpecialistIds = ["atlas", "pixel", "ledger", "echo", "route", "todd"] as const;

const languageNames: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  "zh-CN": "Simplified Chinese",
  ar: "Arabic",
  ru: "Russian"
};

const genericLocalizedReplies: Record<string, string> = {
  ja: "Mayaです。ログイン、ライブアクセス、ウォレット、チップ、動画再生、プライバシーについてお手伝いできます。起きたことと、ご利用の端末やブラウザを教えてください。",
  ko: "Maya입니다. 로그인, 라이브 접속, 지갑, 팁, 재생 및 개인정보 문제를 도와드릴 수 있어요. 어떤 일이 있었고 어떤 기기와 브라우저를 쓰는지 알려주세요.",
  "zh-CN": "我是 Maya。我可以帮助处理登录、直播访问、钱包、打赏、播放和隐私问题。请告诉我发生了什么，以及你使用的设备和浏览器。",
  ar: "أنا Maya. يمكنني المساعدة في تسجيل الدخول والوصول إلى البث والمحفظة والإكراميات والتشغيل والخصوصية. أخبرني بما حدث والجهاز والمتصفح اللذين تستخدمهما.",
  ru: "Я Maya. Я могу помочь со входом, доступом к эфиру, кошельком, чаевыми, воспроизведением и конфиденциальностью. Расскажите, что произошло и каким устройством и браузером вы пользуетесь."
};

function localizedDemoReply(message: string, language = "en") {
  const lower = message.toLowerCase();
  const agent = routeSupportAgent(message);
  if (language === "es") {
    if (lower.includes("tip") || lower.includes("coin") || lower.includes("propina")) {
      return "Maya aquí. Las monedas son créditos digitales para funciones elegibles dentro de XMASKEDFREAKS. La regla de contribución requiere un total de 10 monedas (5 USD) por cada período aplicable de 25 minutos; varias propinas confirmadas pueden sumarse. No necesitas pagar 25 USD. Revisa la FAQ de Wallet para más detalles.";
    }
    if (lower.includes("video") || lower.includes("live") || lower.includes("lag")) {
      return "Nova aquí. Para problemas de video, actualiza una vez, revisa tu conexión y vuelve al directo. Si sigue lento, el admin puede cambiar proveedor o CDN.";
    }
    if (lower.includes("login") || lower.includes("email") || lower.includes("correo")) {
      return "Usa tu correo en el panel de inicio. Supabase enviará un enlace mágico cuando las claves estén configuradas.";
    }
    return "Maya aquí. Puedo ayudar con acceso, cartera, propinas, reproducción, privacidad y soporte. Dime qué pasó y qué dispositivo o navegador usas.";
  }
  if (language === "fr") return "Maya ici. Je peux aider avec la connexion, l’accès live, les jetons, les paiements, la lecture vidéo, la confidentialité et le support. Décrivez le problème et votre appareil.";
  if (language === "de") return "Maya hier. Ich kann bei Login, Live-Zugang, Coins, Zahlungen, Wiedergabe, Datenschutz und Support helfen. Sag mir bitte, was passiert ist und welchen Browser du nutzt.";
  if (language === "pt") return "Maya aqui. Posso ajudar com login, acesso ao vivo, moedas, pagamentos, reprodução, privacidade e suporte. Conte o que aconteceu e qual dispositivo/navegador você usa.";
  if (/\b(refund|duplicate|charged|billing error|unauthorized)\b/.test(lower)) {
    return `Maya here. ${faqAnswerById(fallbackMessages, "tip-refunds")}`;
  }
  if (/\b(tip|tips|tipping)\b/.test(lower)) {
    return `Maya here. ${faqAnswerById(fallbackMessages, "tips")}`;
  }
  if (/\b(coin|coins)\b/.test(lower)) {
    return `Maya here. ${faqAnswerById(fallbackMessages, "coin-usage")}`;
  }
  if (/\b(wallet|deposit|purchase|payment|method)\b/.test(lower)) {
    return `Maya here. ${faqAnswerById(fallbackMessages, "wallet-deposits")}`;
  }
  if (/\b(prerecorded|pre-recorded|really live|actually live|stream format)\b/.test(lower)) {
    return `Maya here. ${faqAnswerById(fallbackMessages, "stream-format")}`;
  }
  if (/\b(who is maya|what is maya|can maya pay|confirm purchase)\b/.test(lower)) {
    return `Maya here. ${faqAnswerById(fallbackMessages, "maya")}`;
  }
  if (agent.id === "nova" || lower.includes("video") || lower.includes("live") || lower.includes("lag")) {
    return "Nova here. I’m testing the viewer’s path across device and browser conditions. Refresh once, check your connection, and jump back to live. If it still fails, I will keep this conversation and send a protected diagnostic summary for review.";
  }
  if (lower.includes("login") || lower.includes("email")) {
    return "Use your email on the login panel. Supabase magic-link auth will send a sign-in link once your Supabase keys are configured.";
  }
  if (agent.id === "riley" || lower.includes("billing") || lower.includes("payment") || lower.includes("refund")) {
    return "Riley here. I’ll keep this calm and verify the details first. Billing and refunds need admin review. Keep your receipt email and transaction time so support can match the payment.";
  }
  if (agent.id === "sage") return "Sage here. I’m checking the behavior against the platform rules and safety history. Share your username, account email, and what happened so admin can review if needed.";
  return genericLocalizedReplies[language] || "Maya here. I can help with login, live access, wallet deposits, tipping, playback, privacy, and support. Tell me what happened and what device/browser you are using.";
}

function routeSupportAgent(message: string) {
  const lower = message.toLowerCase();
  if (/\b(bill|billing|wallet|deposit|payment|paid|card|charge|refund|transaction|webhook|duplicate|processor|chargeback|coin)\b/.test(lower)) return visitorSupportProfiles.riley;
  if (/\b(video|playback|stream|lag|buffer|audio|sound|black screen|freeze|resolution|layout|mobile|button|screen|browser error|visual|responsive|accessibility|click|interface|page|load|game|score|leaderboard|pac|space|arcade|network|bandwidth|slow|cdn|connection|obs|chat|notification|tip alert|real.?time|live signal)\b/.test(lower)) return visitorSupportProfiles.nova;
  if (/\b(account|login|password|ban|appeal|moderation|blocked|access|privacy|policy|prohibited|slur|harassment|threat)\b/.test(lower)) return visitorSupportProfiles.sage;
  return visitorSupportProfiles.maya;
}

function hiddenSpecialistsForSupport(message: string, visibleAgentId: keyof typeof visitorSupportProfiles) {
  const lower = message.toLowerCase();
  const specialists: Array<(typeof hiddenSpecialistIds)[number]> = [];
  if (visibleAgentId === "riley" || /\b(webhook|duplicate|processor|refund|chargeback|wallet balance|coin)\b/.test(lower)) specialists.push("ledger");
  if (visibleAgentId === "riley" && /\b(login|account|api|server|database|auth|failed)\b/.test(lower)) specialists.push("atlas");
  if (visibleAgentId === "nova" || /\b(obs|stream|chat|notification|audio|live signal)\b/.test(lower)) specialists.push("echo");
  if (visibleAgentId === "nova" || /\b(layout|mobile|button|browser|page|visual|load|interface)\b/.test(lower)) specialists.push("pixel");
  if (visibleAgentId === "nova" && /\b(server|api|database|auth|login|backend)\b/.test(lower)) specialists.push("atlas");
  if (visibleAgentId === "sage") specialists.push("atlas");
  if (visibleAgentId === "sage" && /\b(traffic|referral|route|vpn|ip|location)\b/.test(lower)) specialists.push("route");
  if (/\b(game|score|leaderboard|pac|space|arcade)\b/.test(lower)) specialists.push("todd");
  if (visibleAgentId === "maya" && /\b(redirect|referral|campaign|fansly|clips4sale)\b/.test(lower)) specialists.push("route");
  return [...new Set(specialists)];
}

function supportWorkflowFor(visibleAgentId: keyof typeof visitorSupportProfiles, hiddenSpecialists: string[]) {
  if (visibleAgentId === "riley") return ["Visitor", "Riley", "Claude", "Ledger", ...(hiddenSpecialists.includes("atlas") ? ["Atlas"] : []), "Claude", "Riley", "Visitor"];
  if (visibleAgentId === "nova") return ["Visitor", "Nova", "Claude", "Echo", "Pixel", ...(hiddenSpecialists.includes("atlas") ? ["Atlas"] : []), "Claude", "Nova", "Visitor"];
  if (visibleAgentId === "sage") return ["Visitor", "Sage", "Claude", "Atlas", ...(hiddenSpecialists.includes("route") ? ["Route"] : []), "Claude", "Sage", "Visitor"];
  return ["Visitor", "Maya", ...(hiddenSpecialists.length ? ["Claude", ...hiddenSpecialists, "Claude"] : []), "Maya", "Visitor"];
}

function shouldEscalate(message: string, agentId: string) {
  return /\b(human|admin|urgent|refund|duplicate|charged|chargeback|cannot access|locked|appeal|unsafe|broken|outage)\b/i.test(message)
    || ["riley", "sage"].includes(agentId)
    || hiddenSpecialistsForSupport(message, agentId as keyof typeof visitorSupportProfiles).length > 0;
}

async function queueAdminEscalation(payload: Record<string, unknown>) {
  const endpoint = process.env.SUPPORT_ESCALATION_ENDPOINT;
  if (!endpoint) return;
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => undefined);
}

async function saveSupportMessage(message: string, reply: string, agent: ReturnType<typeof routeSupportAgent>, escalation: Record<string, unknown> | null) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  await supabase.from("support_messages").insert({
    visitor_message: message,
    assistant_reply: reply,
    assigned_agent: agent.name,
    issue_type: agent.issueType,
    escalated: Boolean(escalation),
    escalation_payload: escalation
  });
}

async function getAiReply(message: string, history: SupportMessage[], language: string, agent: ReturnType<typeof routeSupportAgent>) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_SUPPORT_MODEL || "gpt-4.1-mini";
  const languageInstruction = `Reply in ${languageNames[language] || "the user's selected language"} whenever possible. Preserve currency, dates, names, and platform terms clearly. Answer only as visible visitor agent ${agent.name}, assigned to ${agent.issueType}. Open with this operating line only when useful: ${agent.saying}. Do not mention hidden specialist names or Claude in ordinary visitor chat; say protected admin review or diagnostic review when needed. Escalation rule: ${agent.escalation}`;

  if (!apiKey) return localizedDemoReply(message, language);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      instructions: `${supportSystemPrompt} ${languageInstruction}`,
      input: [
        ...history.map((item) => ({
          role: item.role,
          content: item.content
        })),
        {
          role: "user",
          content: message
        }
      ]
    })
  });

  if (!response.ok) return localizedDemoReply(message, language);

  const data = await response.json();
  return data.output_text || localizedDemoReply(message, language);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    message?: string;
    history?: SupportMessage[];
    language?: string;
    username?: string;
    metadata?: {
      pageUrl?: string;
      deviceType?: string;
      browser?: string;
      accountReference?: string;
      transactionReference?: string;
    };
  };
  const message = body.message?.trim();
  const language = normalizeLocale(body.language);

  if (!message) {
    return NextResponse.json({ reply: "Send a message and I can help." }, { status: 400 });
  }

  const agent = routeSupportAgent(message);
  const reply = await getAiReply(message, body.history || [], language, agent);
  const hiddenSpecialists = hiddenSpecialistsForSupport(message, agent.id);
  const escalation = shouldEscalate(message, agent.id) ? {
    adminEmail: process.env.ADMIN_SUPPORT_EMAIL || process.env.DEPOSIT_ALERT_EMAIL || "ustension@gmail.com",
    username: body.username || "visitor",
    issueType: agent.issueType,
    assignedAgent: agent.name,
    visibleLayer: "Layer 1 · Visitor Support",
    hiddenSpecialists,
    claudeLayer: "Layer 3 · Central coordinator and final decision-maker",
    workflow: supportWorkflowFor(agent.id, hiddenSpecialists),
    visitorContinuity: `${agent.name} remains responsible for this visitor conversation from beginning to end.`,
    specialistReportTemplate: hiddenSpecialists.map((specialist) => ({
      specialist,
      problemObserved: message.slice(0, 180),
      evidenceCollected: ["visitor message", "page URL", "device/browser metadata", "recent account or transaction reference when available"],
      likelyRootCause: "pending Claude-coordinated diagnostics",
      confidenceLevel: "pending",
      safeActionsAttempted: ["visible agent collected facts and safe basic troubleshooting only"],
      result: "awaiting protected ADMIN diagnostics",
      remainingRisks: ["money, security, bans, account ownership, deletion, or deployment changes require administrator approval"],
      adminApprovalRequired: ["ledger", "atlas", "route"].includes(specialist)
    })),
    message,
    timestamp: new Date().toISOString(),
    pageUrl: body.metadata?.pageUrl || request.headers.get("referer") || "/",
    deviceType: body.metadata?.deviceType || "unknown",
    browser: body.metadata?.browser || request.headers.get("user-agent") || "unknown",
    accountReference: body.metadata?.accountReference || null,
    transactionReference: body.metadata?.transactionReference || null
  } : null;
  if (escalation) await queueAdminEscalation(escalation);
  await saveSupportMessage(message, reply, agent, escalation);

  return NextResponse.json({ reply, agent: agent.name, escalated: Boolean(escalation) });
}
