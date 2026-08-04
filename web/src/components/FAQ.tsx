import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "Is SharedMoney free to use?",
    answer: "Yes. SharedMoney is free for tracking shared expenses and balances.",
  },
  {
    question: "Is my financial data secure?",
    answer:
      "SharedMoney stores group records, participants, expenses, and balances. We focus on clear records, not storing payment instruments.",
  },
  {
    question: "Do my friends need to download an app?",
    answer:
      "SharedMoney is available through the web app for anyone, and Android users can install the app from Google Play. iOS is currently available via TestFlight.",
  },
  {
    question: "What happens if someone doesn’t pay?",
    answer:
      "SharedMoney keeps the shared ledger visible and up-to-date. Payment happens in your preferred payment app outside SharedMoney.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="container faq">
      <div className="section-head section-head-wide">
        <p className="kicker">FAQ</p>
        <h2 id="faq-title">Clear answers.</h2>
      </div>

      <div className="faq-list" aria-labelledby="faq-title">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index;

          return (
            <div className="faq-item" key={faq.question}>
              <button
                type="button"
                className={`faq-question ${isOpen ? "is-open" : ""}`}
                aria-expanded={isOpen}
                aria-controls={`faq-answer-${index}`}
                id={`faq-question-${index}`}
                onClick={() => setOpenIndex(isOpen ? null : index)}
              >
                <span>{faq.question}</span>
                <ChevronDown
                  size={18}
                  className={`faq-toggle ${isOpen ? "is-open" : ""}`}
                  aria-hidden
                />
              </button>

              <div
                id={`faq-answer-${index}`}
                className={`faq-answer ${isOpen ? "is-open" : ""}`}
                role="region"
                aria-labelledby={`faq-question-${index}`}
                hidden={!isOpen}
              >
                <p>{faq.answer}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
