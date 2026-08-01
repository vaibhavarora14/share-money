import { CheckCircle2, CircleDollarSign, ReceiptText } from "lucide-react";

const pulseMembers = [
  { initials: "KA", name: "Kai", amount: "owes $31.40", tone: "negative" },
  { initials: "AR", name: "Ari", amount: "is owed $58.60", tone: "positive" },
  { initials: "SA", name: "Sam", amount: "owes $27.20", tone: "negative" },
  { initials: "CH", name: "Charlie", amount: "settled", tone: "neutral" },
] as const;

const pulseActivity = [
  { date: "Thu", text: "Kai added groceries", amount: "$84.20" },
  { date: "Sat", text: "Ari added dinner", amount: "$55.60" },
  { date: "Sun", text: "Sam added snacks", amount: "$36.00" },
  { date: "Now", text: "ShareMoney calculated two transfers", amount: "Ready" },
] as const;

export function GroupPulse() {
  return (
    <section className="section proof-section" aria-labelledby="proof-title">
      <div className="container">
        <div className="section-head section-head-wide">
          <p className="kicker">Weekly Dinner Club example</p>
          <h2 id="proof-title">From shared spending to a clean finish.</h2>
          <p>
            Every expense changes one shared record. Everyone can see what happened,
            who is affected, and what closes the balance.
          </p>
        </div>

        <div className="group-pulse">
          <div className="pulse-column pulse-balances">
            <div className="pulse-column-title">
              <CircleDollarSign size={20} aria-hidden />
              <h3>Member balances</h3>
            </div>
            <div className="pulse-member-list" role="list">
              {pulseMembers.map((member) => (
                <div className="pulse-member" role="listitem" key={member.name}>
                  <span className="avatar avatar-small" aria-hidden>{member.initials}</span>
                  <span>{member.name}</span>
                  <strong className={`amount amount-${member.tone}`}>{member.amount}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="pulse-column pulse-activity">
            <div className="pulse-column-title">
              <ReceiptText size={20} aria-hidden />
              <h3>Shared activity</h3>
            </div>
            <ol className="pulse-timeline">
              {pulseActivity.map((item) => (
                <li key={`${item.date}-${item.text}`}>
                  <span className="pulse-date">{item.date}</span>
                  <span>{item.text}</span>
                  <strong>{item.amount}</strong>
                </li>
              ))}
            </ol>
          </div>

          <div className="pulse-column pulse-result">
            <CheckCircle2 size={38} aria-hidden />
            <p className="pulse-result-label">After 2 transfers</p>
            <h3>Everyone is settled.</h3>
            <p>Kai and Sam pay Ari. No additional payments are needed.</p>
            <dl>
              <div>
                <dt>Total spend</dt>
                <dd>$175.80</dd>
              </div>
              <div>
                <dt>Open balance</dt>
                <dd>$0.00</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
