import { BrandLockup } from "./BrandMark";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <a className="footer-brand" href="#main-content" aria-label="Back to ShareMoney home">
          <BrandLockup />
        </a>
        <nav className="footer-links" aria-label="Support and legal">
          <a href="mailto:contact@sharedmoney.app">Contact support</a>
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
          <a href="/delete-account.html" target="_blank" rel="noopener noreferrer">Delete account</a>
        </nav>
        <p>© {new Date().getFullYear()} ShareMoney. All rights reserved.</p>
      </div>
    </footer>
  );
}
