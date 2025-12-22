function App() {
  return (
    <div className="app">
      {/* Navigation */}
      <nav style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(12px)',
        backgroundColor: 'var(--gradient-nav)',
        borderBottom: '1px solid var(--color-border)'
      }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img 
              src="/icon.png" 
              alt="ShareMoney Logo" 
              style={{ 
                width: '32px', 
                height: '32px',
                borderRadius: '6px'
              }} 
            />
            <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>ShareMoney</span>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <a href="https://share-money.expo.app" className="btn btn-primary">
              Launch Web App
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="section" style={{ textAlign: 'center', overflow: 'hidden' }}>
        <div className="container">
          <style>
            {`
              @keyframes float {
                0% { transform: translateY(0px); }
                50% { transform: translateY(-20px); }
                100% { transform: translateY(0px); }
              }
              .float-animation {
                animation: float 6s ease-in-out infinite;
              }
              .hero-gradient-text {
                background: var(--gradient-primary);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
              }
            `}
          </style>
          <h1 style={{ marginBottom: '1.5rem', maxWidth: '800px', margin: '0 auto 1.5rem' }}>
             Split Expenses. <br/>
            <span className="hero-gradient-text">Simplify Life.</span>
          </h1>
          <p style={{ fontSize: '1.25rem', maxWidth: '600px', margin: '0 auto 2.5rem' }}>
            The easiest way to track shared expenses, settle up with friends, and manage group finances without the headache.
          </p>
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '4rem', position: 'relative', zIndex: 10 }}>
            <a href="https://share-money.expo.app" className="btn btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.125rem' }}>
              Get Started for Free
            </a>
            <a href="mailto:varora1406@gmail.com?subject=ShareMoney Early Access Request" className="btn btn-secondary" style={{ padding: '1rem 2rem', fontSize: '1.125rem' }}>
              Email for Early Access
            </a>
          </div>

          <div className="float-animation" style={{ 
            marginTop: '2rem',
            position: 'relative',
            borderRadius: '24px',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-xl)',
            maxWidth: '600px',
            margin: '0 auto',
            zIndex: 1
          }}>
            <img 
              src="/nano-hero.png" 
              alt="Nano Finance Abstract" 
              style={{ width: '100%', display: 'block' }}
            />
          </div>
        </div>
      </section>

      {/* How it Works - Timeline */}
      <section className="section" style={{ backgroundColor: 'white' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
             <h2 style={{ marginBottom: '1rem' }}>How it Works</h2>
             <p style={{ fontSize: '1.125rem' }}>Three steps to financial peace of mind.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', maxWidth: '1000px', margin: '0 auto', position: 'relative' }}>
             {/* Connector Line (Desktop only) */}
             <div className="timeline-connector" style={{ 
               position: 'absolute', 
               top: '24px', 
               left: '16%', 
               right: '16%', 
               height: '2px', 
               backgroundColor: 'var(--color-border)', 
               zIndex: 0,
               display: 'none' // Hidden by default, shown in media query via style tag below
             }}></div>
             <style>{`@media (min-width: 768px) { .timeline-connector { display: block !important; } }`}</style>
             
             <TimelineItem 
               step="1" 
               title="Create a Group" 
               description="Start a group for your trip, house, or project. Invite friends instantly."
             />
              <TimelineItem 
               step="2" 
               title="Add Expenses" 
               description="Log costs as they happen. We handle the math for you."
             />
              <TimelineItem 
               step="3" 
               title="Settle Up" 
               description="Our smart algorithm minimizes transactions so everyone gets paid back fast."
             />
          </div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section className="section">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>Everything you need</h2>
            <p style={{ fontSize: '1.125rem' }}>Powerful features packed into a simple design.</p>
          </div>

          {/* Responsive Bento Grid */}
          <style>
            {`
              .bento-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 1.5rem;
                max-width: 1000px;
                margin: 0 auto;
              }
              
              /* Tablet & Up */
              @media (min-width: 768px) {
                .bento-grid {
                  grid-template-columns: repeat(2, 1fr);
                }
              }

              /* Desktop & Up */
              @media (min-width: 1024px) {
                .bento-grid {
                  grid-template-columns: repeat(3, 1fr);
                  grid-template-rows: repeat(2, auto);
                }
                .bento-large { grid-column: span 2; }
                .bento-tall { grid-row: span 2; }
              }
            `}
          </style>

          <div className="bento-grid">
             {/* Large Card: Smart Settlements */}
            <div className="bento-large" style={{ 
              backgroundColor: 'white', 
              padding: '2.5rem', 
              borderRadius: '24px', 
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}>
               <div style={{ fontSize: '3rem', marginBottom: '1rem', color: 'var(--color-primary)' }}>💸</div>
               <h3 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Smart Settlements</h3>
               <p style={{ fontSize: '1.125rem' }}>Our proprietary algorithm calculates the most efficient way to pay everyone back, minimizing the number of transactions by up to 70%.</p>
            </div>

            {/* Tall Card: Real-time Sync */}
            <div className="bento-tall" style={{ 
              backgroundColor: 'var(--color-primary)', 
              color: 'white',
              padding: '2.5rem', 
              borderRadius: '24px', 
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}>
               <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔄</div>
               <h3 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', color: 'white' }}>Real-time Sync</h3>
               <p style={{ fontSize: '1.125rem', opacity: 0.9, color: 'white' }}>Changes update instantly across all your devices. Never wonder if you're looking at old data.</p>
            </div>

            {/* Small Card: Multi-Currency */}
             <div style={{ 
              backgroundColor: 'white', 
              padding: '2rem', 
              borderRadius: '24px', 
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--color-border)'
            }}>
               <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🌍</div>
               <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Multi-Currency</h3>
               <p>Add expenses in any currency.</p>
            </div>

             {/* Small Card: Stats */}
             <div style={{ 
              backgroundColor: 'white', 
              padding: '2rem', 
              borderRadius: '24px', 
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--color-border)'
            }}>
               <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📊</div>
               <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Spending Stats</h3>
               <p>Visualize where your money goes.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Download Section */}
      <section id="download" className="section" style={{ textAlign: 'center' }}>
        <div className="container">
          <div style={{ 
            backgroundColor: 'var(--color-primary)', 
            borderRadius: '24px',
            padding: '4rem 2rem',
            color: 'white',
            backgroundImage: 'var(--gradient-primary)'
          }}>
            <h2 style={{ marginBottom: '1rem', color: 'white' }}>Start Sharing Today</h2>
            <p style={{ fontSize: '1.25rem', marginBottom: '2.5rem', opacity: 0.9, color: 'white' }}>
              Web is live! Mobile apps coming soon.
            </p>
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', flexDirection: 'column', alignItems: 'center' }}>
               <a 
                href="https://share-money.expo.app" 
                className="btn" 
                style={{ 
                  backgroundColor: 'white', 
                  color: 'var(--color-primary)', 
                  fontWeight: '700',
                  padding: '1rem 3rem',
                  fontSize: '1.25rem'
                }}
              >
                Launch Web App Now
              </a>

              <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <span style={{ opacity: 0.9, color: 'white' }}>Want the mobile app?</span>
                <a 
                  href="mailto:varora1406@gmail.com?subject=ShareMoney Mobile Early Access Request" 
                  className="btn"
                  style={{ 
                    backgroundColor: 'rgba(255,255,255,0.15)', 
                    color: 'white', 
                    border: '1px solid rgba(255,255,255,0.3)',
                    fontSize: '0.9rem',
                    padding: '0.5rem 1rem'
                  }}
                >
                  Request Early Access (iOS/Android)
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '4rem 0', borderTop: '1px solid var(--color-border)', backgroundColor: '#f8fafc' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '2rem', fontWeight: 700, fontSize: '1.5rem', color: 'var(--color-primary)' }}>ShareMoney</div>
          <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', marginBottom: '2rem', color: 'var(--color-text-main)' }}>
            <a href="mailto:varora1406@gmail.com" style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>Contact Support</a>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>© {new Date().getFullYear()} ShareMoney. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

function TimelineItem({ step, title, description }: { step: string, title: string, description: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', position: 'relative', zIndex: 1 }}>
      <div style={{ 
        width: '48px', 
        height: '48px', 
        borderRadius: '50%', 
        backgroundColor: 'var(--color-primary)', 
        color: 'white',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize: '1.25rem',
        marginBottom: '1rem',
        boxShadow: '0 0 0 8px white' // Creates space around the line
      }}>
        {step}
      </div>
      <div>
        <h3 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>{title}</h3>
        <p style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>{description}</p>
      </div>
    </div>
  )
}

export default App
