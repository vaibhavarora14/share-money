/**
 * FAQ Component
 * Expandable FAQ section for common questions
 */
import { useState } from 'react';

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "Is ShareMoney free to use?",
    answer: "Yes! ShareMoney is completely free. We believe managing shared expenses shouldn't cost you anything."
  },
  {
    question: "How does the smart settlement algorithm work?",
    answer: "Our algorithm analyzes all debts and credits in a group to find the minimum number of transactions needed to settle everyone up. Instead of multiple back-and-forth payments, we calculate the most efficient settlement path."
  },
  {
    question: "Is my financial data secure?",
    answer: "Yes. We never store your actual payment information. We only track who owes what, not your bank details. All data is stored securely and you maintain full control."
  },
  {
    question: "Can I use ShareMoney for international trips?",
    answer: "Yes! ShareMoney supports multiple currencies, making it perfect for international travel and expenses in different countries."
  },
  {
    question: "Do my friends need to download the app?",
    answer: "No! ShareMoney works on the web, so your friends can access it from any device with a browser. Mobile apps are coming soon for an even better experience."
  },
  {
    question: "What happens if someone doesn't pay?",
    answer: "ShareMoney helps you track who owes what, but the actual payment happens outside the app. We provide clear records you can share to remind people of their obligations."
  }
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="section" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Frequently Asked Questions</h2>
          <p style={{ fontSize: '1.125rem' }}>Everything you need to know about ShareMoney.</p>
        </div>

        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          {faqs.map((faq, index) => (
            <div
              key={index}
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
                overflow: 'hidden',
                transition: 'all 0.2s ease'
              }}
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                style={{
                  width: '100%',
                  padding: '1.5rem',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  color: 'var(--color-text-main)'
                }}
                aria-expanded={openIndex === index}
                aria-controls={`faq-answer-${index}`}
              >
                <span>{faq.question}</span>
                <span style={{
                  fontSize: '1.5rem',
                  transition: 'transform 0.2s ease',
                  transform: openIndex === index ? 'rotate(180deg)' : 'rotate(0deg)'
                }}>
                  ▼
                </span>
              </button>
              {openIndex === index && (
                <div
                  id={`faq-answer-${index}`}
                  style={{
                    padding: '0 1.5rem 1.5rem 1.5rem',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.6
                  }}
                >
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

