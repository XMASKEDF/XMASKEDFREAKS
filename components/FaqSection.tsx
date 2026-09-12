"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { activeFaqEntries, splitFaqAnswer } from "@/lib/support/faq";

type FaqSectionProps = {
  translate: (key: string) => string;
  hideCoinUsage?: boolean;
};

function isNumberedBlock(block: string) {
  return /^1\.\s/m.test(block) && /\n2\.\s/m.test(block);
}

function numberedItems(block: string) {
  return block.split(/\n(?=\d+\.\s)/).map((item) => item.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
}

export default function FaqSection({ translate, hideCoinUsage = false }: FaqSectionProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const scrollPositionRef = useRef<number | null>(null);
  const entries = activeFaqEntries(hideCoinUsage ? ["coin-usage"] : []);

  useLayoutEffect(() => {
    if (scrollPositionRef.current === null) return;
    window.scrollTo(0, scrollPositionRef.current);
    scrollPositionRef.current = null;
  }, [openId]);

  function toggleAnswer(id: string) {
    scrollPositionRef.current = window.scrollY;
    setOpenId((current) => current === id ? null : id);
  }

  function openMaya() {
    window.dispatchEvent(new CustomEvent("xmf:open-support"));
  }

  function openPolicy(policyId: string) {
    const policy = document.getElementById(policyId);
    if (policy instanceof HTMLDetailsElement) policy.open = true;
  }

  return (
    <section className="faq-panel" id="faq" aria-labelledby="faq-title">
      <div className="section-heading faq-heading">
        <p className="kicker">{translate("faq.kicker")}</p>
        <h2 id="faq-title">{translate("faq.title")}</h2>
        <p>{translate("faq.copy")}</p>
      </div>

      <div className="faq-grid">
        {entries.map((entry) => {
          const expanded = openId === entry.id;
          const answerId = `faq-answer-${entry.id}`;
          return (
            <article className={`faq-item ${expanded ? "is-open" : ""}`} key={entry.id}>
              <h3>
                <button
                  id={`faq-question-${entry.id}`}
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={answerId}
                  onClick={() => toggleAnswer(entry.id)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    toggleAnswer(entry.id);
                  }}
                >
                  <span>{translate(entry.questionKey)}</span>
                  <span className="faq-disclosure" aria-hidden="true">+</span>
                </button>
              </h3>
              <div className="faq-answer-motion" id={answerId} role="region" aria-labelledby={`faq-question-${entry.id}`} aria-hidden={!expanded}>
                <div className="faq-answer-inner">
                  {splitFaqAnswer(translate(entry.answerKey)).map((block, index) => isNumberedBlock(block) ? (
                    <ol key={`${entry.id}-list-${index}`}>
                      {numberedItems(block).map((item) => <li key={item}>{item}</li>)}
                    </ol>
                  ) : <p key={`${entry.id}-paragraph-${index}`}>{block}</p>)}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <aside className="faq-support-panel" aria-labelledby="faq-support-title">
        <div>
          <p className="kicker">Support</p>
          <h3 id="faq-support-title">NEED MORE HELP?</h3>
          <p>{translate("faq.support.copy")}</p>
        </div>
        <div className="faq-support-actions">
          <button className="primary" type="button" onClick={openMaya}>Ask Maya</button>
          <a href="/policies#terms">Terms</a>
          <a href="#privacy" onClick={() => openPolicy("privacy")}>Privacy</a>
          <a href="/policies#refunds">Refund Policy</a>
          <a href="/policies#dmca">DMCA</a>
        </div>
      </aside>
    </section>
  );
}
