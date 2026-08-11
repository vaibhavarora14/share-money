import { migrationCtaHref, trackMigrationCtaClick, trackRelatedPageClick } from "../../analytics";
import type { PlatformDestination } from "../../landingContent";
import { relatedPages, type SeoPage } from "../../seoPages";
import { PlatformCta } from "../landing/PlatformCta";

export function PageHero({
  page,
  primaryDestination,
}: {
  page: SeoPage;
  primaryDestination: PlatformDestination;
}) {
  return (
    <section className="route-hero">
      <div className="container route-hero-shell">
        <div>
          <p className="kicker">{page.eyebrow}</p>
          <h1>{page.heading}</h1>
          <p>{page.body}</p>
          <div className="route-hero-actions">
            {page.cta ? (
              <a
                className="cta cta-primary migration-cta"
                href={migrationCtaHref(page)}
                aria-label={page.cta.ariaLabel}
                onClick={() => trackMigrationCtaClick(page)}
              >
                <span className="cta-label">{page.cta.label}</span>
              </a>
            ) : (
              <PlatformCta
                destination={primaryDestination}
                placement={`route_${page.id}`}
                appearance="primary"
              />
            )}
          </div>
        </div>
        <ul aria-label={`${page.heading} highlights`}>
          {page.proof.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
    </section>
  );
}

export function SeoPageContent({ page }: { page: SeoPage }) {
  const related = relatedPages(page);

  return (
    <>
      <section className="section seo-sections">
        <div className="container seo-section-grid">
          {page.sections.map((section) => (
            <article className="seo-copy-card" key={section.heading}>
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
              <ul>
                {section.bullets.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {page.screenshots?.length ? (
        <section className="section seo-media-section" aria-labelledby="page-media-title">
          <div className="container">
            <div className="section-head">
              <p className="kicker">See the group view</p>
              <h2 id="page-media-title">A shared ledger the group can check together.</h2>
            </div>
            <div className="seo-media-grid">
              {page.screenshots.map((screenshot) => (
                <figure className="seo-media" key={screenshot.src}>
                  <img src={screenshot.src} alt={screenshot.alt} loading="lazy" />
                  <figcaption>{screenshot.caption}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {page.comparison?.length ? (
        <section className="section seo-comparison-section" aria-labelledby="comparison-title">
          <div className="container seo-comparison-shell">
            <div className="section-head">
              <p className="kicker">At a glance</p>
              <h2 id="comparison-title">Choose the path that fits your group.</h2>
            </div>
            <div
              className="seo-comparison-scroll"
              role="region"
              aria-label="Feature comparison"
              tabIndex={0}
            >
              <table className="seo-comparison">
                <caption>SharedMoney and continuing with your current Splitwise group</caption>
                <thead>
                  <tr>
                    <th scope="col">What you need</th>
                    <th scope="col">SharedMoney</th>
                    <th scope="col">Current Splitwise group</th>
                  </tr>
                </thead>
                <tbody>
                  {page.comparison.map((row) => (
                    <tr key={row.feature}>
                      <th scope="row">{row.feature}</th>
                      <td>{row.sharedMoney}</td>
                      <td>{row.splitwise}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {page.steps?.length ? (
        <section className="section seo-steps-section" aria-labelledby="migration-steps-title">
          <div className="container">
            <div className="section-head">
              <p className="kicker">How the move works</p>
              <h2 id="migration-steps-title">A reviewable path from export to invite.</h2>
            </div>
            <ol className="seo-steps">
              {page.steps.map((step, index) => (
                <li key={step.title}>
                  <span aria-hidden="true">{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {page.limitations?.length ? (
        <section className="section seo-limitations-section" aria-labelledby="limitations-title">
          <div className="container seo-limitations">
            <div>
              <p className="kicker">Before you import</p>
              <h2 id="limitations-title">A few useful limits to know.</h2>
            </div>
            <ul>
              {page.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="section seo-faq-section" aria-labelledby="page-faq-title">
        <div className="container seo-faq-shell">
          <div className="section-head">
            <p className="kicker">Questions, answered</p>
            <h2 id="page-faq-title">Useful details before you start.</h2>
          </div>
          <div className="seo-faq-list">
            {page.faqs.map((faq) => (
              <details key={faq.question} className="seo-faq-item">
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {page.disclaimer ? (
        <section className="seo-disclaimer" aria-label="Trademark disclaimer">
          <div className="container">
            <p>{page.disclaimer}</p>
          </div>
        </section>
      ) : null}

      {related.length > 0 ? (
        <section className="section related-section" aria-labelledby="related-pages-title">
          <div className="container">
            <div className="section-head">
              <p className="kicker">Keep exploring</p>
              <h2 id="related-pages-title">More ways to make group money clear.</h2>
            </div>
            <nav className="related-pages" aria-label="Related SharedMoney pages">
              {related.map((relatedPage) => (
                <a
                  href={relatedPage.path}
                  key={relatedPage.id}
                  onClick={() => trackRelatedPageClick(page, relatedPage)}
                >
                  <span>{relatedPage.eyebrow}</span>
                  <strong>{relatedPage.heading}</strong>
                  <small>Explore</small>
                </a>
              ))}
            </nav>
          </div>
        </section>
      ) : null}
    </>
  );
}

export function NotFoundPage() {
  return (
    <main id="main-content" className="not-found-page">
      <div className="container">
        <p className="kicker">404</p>
        <h1>That page is not here.</h1>
        <p>Try the SharedMoney home page or explore the free calculators.</p>
        <p><a className="cta cta-primary" href="/">Return home</a></p>
      </div>
    </main>
  );
}
