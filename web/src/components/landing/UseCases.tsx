import { useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArrowRight, UsersRound } from "lucide-react";
import {
  useCaseKeys,
  useCaseScenarios,
  type UseCaseKey,
} from "../../landingContent";

export function UseCases() {
  const [activeUseCase, setActiveUseCase] = useState<UseCaseKey>("dinner");
  const scenario = useCaseScenarios[activeUseCase];

  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentKey: UseCaseKey,
  ) => {
    const currentIndex = useCaseKeys.indexOf(currentKey);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % useCaseKeys.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + useCaseKeys.length) % useCaseKeys.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = useCaseKeys.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextKey = useCaseKeys[nextIndex];
    setActiveUseCase(nextKey);
    requestAnimationFrame(() => {
      document.getElementById(`use-case-tab-${nextKey}`)?.focus();
    });
  };

  return (
    <section id="use-cases" className="section use-cases-section">
      <div className="container">
        <div className="section-head">
          <p className="kicker">Made for real group rhythms</p>
          <h2>Different groups. The same clear record.</h2>
          <p>Choose a scenario to see how the people, spending, and final balance fit together.</p>
        </div>

        <div className="use-case-tabs" role="tablist" aria-label="OweWho use cases">
          {useCaseKeys.map((key) => (
            <button
              type="button"
              role="tab"
              id={`use-case-tab-${key}`}
              aria-controls="use-case-panel"
              aria-selected={activeUseCase === key}
              tabIndex={activeUseCase === key ? 0 : -1}
              className={activeUseCase === key ? "is-active" : ""}
              key={key}
              onClick={() => setActiveUseCase(key)}
              onKeyDown={(event) => handleKeyDown(event, key)}
            >
              {useCaseScenarios[key].label}
            </button>
          ))}
        </div>

        <div
          id="use-case-panel"
          role="tabpanel"
          aria-labelledby={`use-case-tab-${activeUseCase}`}
          className={`use-case-panel use-case-panel-${scenario.tone}`}
        >
          <div className="scenario-overview">
            <p className="scenario-kicker">{scenario.kicker}</p>
            <h3>{scenario.title}</h3>
            <p>{scenario.summary}</p>
            <div className="scenario-totals">
              {scenario.totals.map((total) => (
                <div key={total.label}>
                  <span>{total.label}</span>
                  <strong>{total.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="scenario-members">
            <div className="scenario-column-heading">
              <UsersRound size={19} aria-hidden />
              <h3>People and balances</h3>
            </div>
            <div role="list">
              {scenario.members.map((member) => (
                <div className="scenario-member" role="listitem" key={member.name}>
                  <span className="avatar avatar-small" aria-hidden>{member.initials}</span>
                  <span className="member-copy">
                    <strong>{member.name}</strong>
                    <span>{member.detail}</span>
                  </span>
                  <strong className={`amount amount-${member.tone}`}>{member.amount}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="scenario-activity">
            <div className="scenario-column-heading">
              <ArrowRight size={19} aria-hidden />
              <h3>Recent activity</h3>
            </div>
            <ol>
              {scenario.activity.map((item) => (
                <li key={`${item.date}-${item.title}`}>
                  <span className="scenario-date">{item.date}</span>
                  <span className="member-copy">
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </span>
                  {item.amount ? <strong>{item.amount}</strong> : null}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
