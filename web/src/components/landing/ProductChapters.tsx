import { ArrowRight, CheckCircle2, Globe2, History } from "lucide-react";

export function ProductChapters() {
  return (
    <section className="section product-chapters" aria-labelledby="chapters-title">
      <div className="container">
        <div className="section-head">
          <p className="kicker">Built for the life of a group</p>
          <h2 id="chapters-title">Readable today. Useful when it is time to settle.</h2>
        </div>

        <article className="product-chapter">
          <div className="chapter-copy">
            <span className="chapter-icon" aria-hidden><History size={23} /></span>
            <p className="chapter-label">Shared history</p>
            <h3>The whole group can follow what changed.</h3>
            <p>
              Expenses, edits, notes, and settlements stay together, so no one has to
              reconstruct the month from messages and screenshots.
            </p>
            <ul className="chapter-facts">
              <li><CheckCircle2 size={17} aria-hidden />Named activity</li>
              <li><CheckCircle2 size={17} aria-hidden />Group-level summaries</li>
              <li><CheckCircle2 size={17} aria-hidden />Invited and active members</li>
            </ul>
          </div>

          <figure className="chapter-media chapter-media-groups">
            <picture>
              <source type="image/avif" srcSet="/groups-overview.avif" />
              <source type="image/webp" srcSet="/groups-overview.webp" />
              <img
                src="/groups-overview.png"
                alt="ShareMoney group list showing a trip and dinner group"
                width="900"
                height="950"
                loading="lazy"
              />
            </picture>
          </figure>
        </article>

        <article className="product-chapter product-chapter-reverse">
          <div className="chapter-copy">
            <span className="chapter-icon" aria-hidden><Globe2 size={23} /></span>
            <p className="chapter-label">Clear across currencies</p>
            <h3>Each currency keeps its own honest balance.</h3>
            <p>
              A trip can include USD, EUR, and INR without hiding the original amount.
              ShareMoney keeps each currency visible and the final actions readable.
            </p>
            <ul className="chapter-facts">
              <li><CheckCircle2 size={17} aria-hidden />Original currency retained</li>
              <li><CheckCircle2 size={17} aria-hidden />Custom and equal splits</li>
              <li><CheckCircle2 size={17} aria-hidden />No hidden payment fees</li>
            </ul>
          </div>

          <div className="settlement-plan" aria-label="Example settlement plan">
            <div className="settlement-plan-head">
              <span>Summer Vacation</span>
              <strong>2 payments to settle</strong>
            </div>
            <div className="settlement-transfer">
              <span className="avatar avatar-small" aria-hidden>NO</span>
              <span className="member-copy"><strong>Noor</strong><span>pays Maya</span></span>
              <ArrowRight size={18} aria-hidden />
              <strong>$120</strong>
            </div>
            <div className="settlement-transfer">
              <span className="avatar avatar-small" aria-hidden>YO</span>
              <span className="member-copy"><strong>You</strong><span>pay Maya</span></span>
              <ArrowRight size={18} aria-hidden />
              <strong>$40</strong>
            </div>
            <div className="settlement-plan-result">
              <CheckCircle2 size={22} aria-hidden />
              <span><strong>Group settled</strong><small>No extra transfers required</small></span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
