import { workflowSteps } from "../../landingContent";

export function WorkflowSection() {
  return (
    <section className="section workflow-section" aria-labelledby="workflow-title">
      <div className="container">
        <div className="section-head section-head-wide">
          <p className="kicker">One shared workflow</p>
          <h2 id="workflow-title">Add it once. Everyone sees the same math.</h2>
        </div>

        <ol className="workflow-rail">
          {workflowSteps.map((item) => (
            <li key={item.step}>
              <span className="workflow-number">{item.step}</span>
              <item.icon size={23} aria-hidden />
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
